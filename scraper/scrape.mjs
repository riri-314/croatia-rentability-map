#!/usr/bin/env node
// Dalmatia apartment-sale scraper for nekretnine.hr (immobiliare.it network).
//
// Why this approach: each search-results page embeds a Next.js `__NEXT_DATA__`
// JSON blob containing the full structured listing data — price, surface, rooms,
// condition, and real lat/lng coordinates. We read that directly instead of
// parsing fragile HTML. The SEO category pages we hit (/prodaja-stanovi/<county>/)
// are NOT disallowed by the site's robots.txt (only /search-map, /ricerca.php,
// /dettaglio.php are). We stay polite: identifying UA + a delay between requests.
//
// Output: src/data/scraped-listings.json — normalized to the exact shape the app
// consumes, so it drops straight in.
//
// Usage:
//   node scraper/scrape.mjs                 # default: 3 pages/county (~300 listings)
//   node scraper/scrape.mjs --pages 10      # more depth
//   node scraper/scrape.mjs --pages 264     # everything Split-Dalmatia has, etc.
//   node scraper/scrape.mjs --delay 2000    # ms between requests (default 1500)

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'src', 'data', 'scraped-listings.json')

// The four counties that make up the Dalmatia region.
const COUNTIES = [
  { slug: 'splitsko-dalmatinska-zupanija', name: 'Split-Dalmatia' },
  { slug: 'dubrovacko-neretvanska-zupanija', name: 'Dubrovnik-Neretva' },
  { slug: 'sibensko-kninska-zupanija', name: 'Šibenik-Knin' },
  { slug: 'zadarska-zupanija', name: 'Zadar' },
]

const UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0'

// ---- CLI args ----
function arg(flag, def) {
  const i = process.argv.indexOf(flag)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const MAX_PAGES = parseInt(arg('--pages', '3'), 10)
const DELAY_MS = parseInt(arg('--delay', '1500'), 10)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- Field mapping helpers ----

// ga4Condition comes from the Italian platform; map to our model's buckets.
function mapCondition(ga4) {
  const c = (ga4 || '').toLowerCase()
  if (c.includes('nuovo') || c.includes('costruzione'))
    return { condition: 'New / renovated', conditionFactor: 1.18 }
  if (c.includes('ristrutturato') || c.includes('ottimo'))
    return { condition: 'Renovated', conditionFactor: 1.08 }
  if (c.includes('ristrutturare'))
    return { condition: 'Needs work', conditionFactor: 0.82 }
  return { condition: 'Good', conditionFactor: 1.0 }
}

// Heuristic sea signals from the Croatian title + description.
function seaSignals(text) {
  const t = (text || '').toLowerCase()
  const seaView = /pogled na more|sea ?view|meerblick|vue (sur la )?mer/.test(t)
  let distanceToSea = seaView ? 250 : 900 // neutral defaults
  const m = t.match(/(\d{1,4})\s*m(?:etara)?\s*(?:od|do)\s*mora/)
  if (m) distanceToSea = parseInt(m[1], 10)
  else if (/uz more|prvi red do mora|na samoj plaži|beachfront/.test(t)) distanceToSea = 50
  return { seaView: seaView || distanceToSea < 300, distanceToSea }
}

function intFrom(str) {
  if (str == null) return null
  const m = String(str).match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

// Navigate the Next.js blob to the results array (defensive: search if path moves).
function extractResults(json) {
  try {
    const q = json.props.pageProps.dehydratedState.queries
    for (const item of q) {
      const r = item?.state?.data?.results
      if (Array.isArray(r) && r.length && r[0].realEstate) {
        return { results: r, maxPages: item.state.data.maxPages, count: item.state.data.count }
      }
    }
  } catch { /* fall through to deep search */ }
  let found = null
  const walk = (o) => {
    if (found || !o || typeof o !== 'object') return
    if (Array.isArray(o)) return o.forEach(walk)
    if (Array.isArray(o.results) && o.results[0]?.realEstate) { found = o; return }
    Object.values(o).forEach(walk)
  }
  walk(json)
  return found ? { results: found.results, maxPages: found.maxPages, count: found.count } : null
}

// Normalize one realEstate entry to the app's listing shape. Returns null if unusable.
function normalize(entry, county) {
  const re = entry.realEstate || entry
  const prop = (re.properties && re.properties[0]) || {}
  const loc = prop.location || {}

  const price = re.price?.value
  const lat = loc.latitude
  const lng = loc.longitude
  const sizeM2 = intFrom(prop.surface)
  if (!price || !lat || !lng || !sizeM2) return null // need these to be useful
  // Sanity bounds: drop "price on request" sentinels and implausible sizes.
  if (price < 15000 || sizeM2 < 12 || sizeM2 > 1000) return null

  // Only Dalmatia (the network tags the region explicitly).
  if (loc.region && !/dalmac/i.test(loc.region)) return null

  const bedrooms = intFrom(prop.bedRoomsNumber) ?? Math.max(1, (intFrom(prop.rooms) ?? 2) - 1)
  const { condition, conditionFactor } = mapCondition(prop.ga4Condition)
  const { seaView, distanceToSea } = seaSignals(`${re.title} ${prop.description || ''}`)

  return {
    id: re.id,
    city: loc.city || loc.macrozone || county.name,
    province: loc.province || null,
    region: loc.region || null,
    title: re.title || `${bedrooms}-bed apartment, ${loc.city || county.name}`,
    address: loc.address || loc.city || county.name,
    lat: Number(lat),
    lng: Number(lng),
    price: Math.round(price),
    sizeM2,
    bedrooms,
    condition,
    conditionFactor,
    seaView,
    distanceToSea,
    url: `https://www.nekretnine.hr/oglasi/${re.id}/`,
  }
}

async function fetchPage(county, page) {
  const base = `https://www.nekretnine.hr/prodaja-stanovi/${county.slug}/`
  const url = page > 1 ? `${base}?pag=${page}` : base
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'hr,en;q=0.8' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const html = await res.text()
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s,
  )
  if (!m) throw new Error(`no __NEXT_DATA__ on ${url}`)
  return extractResults(JSON.parse(m[1]))
}

async function main() {
  console.log(`Scraping ${COUNTIES.length} Dalmatian counties, up to ${MAX_PAGES} page(s) each (${DELAY_MS}ms apart)\n`)
  const byId = new Map()

  for (const county of COUNTIES) {
    let pages = MAX_PAGES
    for (let page = 1; page <= pages; page++) {
      try {
        const data = await fetchPage(county, page)
        if (!data) { console.warn(`  ${county.name} p${page}: no results block`); break }
        if (page === 1) {
          pages = Math.min(MAX_PAGES, data.maxPages || MAX_PAGES)
          console.log(`${county.name}: ${data.count?.toLocaleString?.() ?? '?'} total listings, fetching ${pages} page(s)`)
        }
        let kept = 0
        for (const e of data.results) {
          const n = normalize(e, county)
          if (n && !byId.has(n.id)) { byId.set(n.id, n); kept++ }
        }
        console.log(`  p${page}/${pages}: ${data.results.length} raw → ${kept} new`)
      } catch (err) {
        console.warn(`  ${county.name} p${page}: ${err.message}`)
      }
      if (page < pages) await sleep(DELAY_MS)
    }
    await sleep(DELAY_MS)
  }

  const listings = [...byId.values()]
  await mkdir(dirname(OUT), { recursive: true })
  const payload = {
    scrapedAt: new Date().toISOString(),
    source: 'nekretnine.hr',
    count: listings.length,
    listings,
  }
  await writeFile(OUT, JSON.stringify(payload, null, 2))

  // quick summary
  const byCity = {}
  for (const l of listings) byCity[l.city] = (byCity[l.city] || 0) + 1
  const top = Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 12)
  console.log(`\n✓ Wrote ${listings.length} listings → ${OUT}`)
  console.log('Top cities:', top.map(([c, n]) => `${c}(${n})`).join(', '))
}

main().catch((e) => { console.error(e); process.exit(1) })
