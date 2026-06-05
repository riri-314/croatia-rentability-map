// Source adapter: nekretnine.hr (immobiliare.it network).
//
// Each search-results page embeds a Next.js `__NEXT_DATA__` JSON blob with full
// structured listing data — price, surface, rooms, condition, lat/lng. We read
// that directly. The SEO category pages we hit are NOT disallowed by robots.txt
// (only /search-map, /ricerca.php, /dettaglio.php are).
//
// A "source adapter" exports { id, name, scrape({ pages, delay, log }) } and
// returns an array of listings already normalized to the app's shape, each
// tagged with `source` and `propertyType`. The orchestrator merges all sources.

const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0'

// The four counties that make up the Dalmatia region.
const COUNTIES = [
  { slug: 'splitsko-dalmatinska-zupanija', name: 'Split-Dalmatia' },
  { slug: 'dubrovacko-neretvanska-zupanija', name: 'Dubrovnik-Neretva' },
  { slug: 'sibensko-kninska-zupanija', name: 'Šibenik-Knin' },
  { slug: 'zadarska-zupanija', name: 'Zadar' },
]

// Property-type categories (each is its own SEO section on the site).
const CATEGORIES = [
  { slug: 'prodaja-stanovi', propertyType: 'apartment' },
  { slug: 'prodaja-samostojeca-kuce', propertyType: 'house' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function intFrom(str) {
  if (str == null) return null
  const m = String(str).match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

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

function seaSignals(text) {
  const t = (text || '').toLowerCase()
  const seaView = /pogled na more|sea ?view|meerblick|vue (sur la )?mer/.test(t)
  let distanceToSea = seaView ? 250 : 900
  const m = t.match(/(\d{1,4})\s*m(?:etara)?\s*(?:od|do)\s*mora/)
  if (m) distanceToSea = parseInt(m[1], 10)
  else if (/uz more|prvi red do mora|na samoj plaži|beachfront/.test(t)) distanceToSea = 50
  return { seaView: seaView || distanceToSea < 300, distanceToSea }
}

function extractResults(json) {
  try {
    const q = json.props.pageProps.dehydratedState.queries
    for (const item of q) {
      const r = item?.state?.data?.results
      if (Array.isArray(r) && r.length && r[0].realEstate)
        return { results: r, maxPages: item.state.data.maxPages, count: item.state.data.count }
    }
  } catch { /* fall through */ }
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

function normalize(entry, county, propertyType) {
  const re = entry.realEstate || entry
  const prop = (re.properties && re.properties[0]) || {}
  const loc = prop.location || {}

  const price = re.price?.value
  const lat = loc.latitude
  const lng = loc.longitude
  const sizeM2 = intFrom(prop.surface)
  if (!price || !lat || !lng || !sizeM2) return null
  if (price < 15000 || sizeM2 < 12 || sizeM2 > 2000) return null
  if (loc.region && !/dalmac/i.test(loc.region)) return null

  const bedrooms = intFrom(prop.bedRoomsNumber) ?? Math.max(1, (intFrom(prop.rooms) ?? 2) - 1)
  const { condition, conditionFactor } = mapCondition(prop.ga4Condition)
  const { seaView, distanceToSea } = seaSignals(`${re.title} ${prop.description || ''}`)

  // Photos: the gallery exposes ids; build medium-size URLs (predictable pattern
  // pic.nekretnine.hr/image/<id>/<size>.jpg). Cap to keep the data file small.
  const photoList = (prop.multimedia && prop.multimedia.photos) || (prop.photo ? [prop.photo] : [])
  const photos = photoList
    .map((p) => p && p.id)
    .filter(Boolean)
    .slice(0, 12)
    .map((pid) => `https://pic.nekretnine.hr/image/${pid}/m-c.jpg`)

  return {
    id: re.id,
    source: 'nekretnine.hr',
    propertyType,
    city: loc.city || loc.macrozone || county.name,
    province: loc.province || null,
    region: loc.region || null,
    title: re.title || `${bedrooms}-bed ${propertyType}, ${loc.city || county.name}`,
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
    photos,
    url: `https://www.nekretnine.hr/oglasi/${re.id}/`,
  }
}

async function fetchPage(category, county, page) {
  const base = `https://www.nekretnine.hr/${category.slug}/${county.slug}/`
  const url = page > 1 ? `${base}?pag=${page}` : base
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'hr,en;q=0.8' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const html = await res.text()
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)
  if (!m) throw new Error(`no __NEXT_DATA__ on ${url}`)
  return extractResults(JSON.parse(m[1]))
}

async function scrape({ pages = 3, delay = 1500, log = console.log } = {}) {
  const out = []
  for (const category of CATEGORIES) {
    for (const county of COUNTIES) {
      let maxPages = pages
      for (let page = 1; page <= maxPages; page++) {
        try {
          const data = await fetchPage(category, county, page)
          if (!data) break
          if (page === 1) {
            maxPages = Math.min(pages, data.maxPages || pages)
            log(`  [${category.propertyType}] ${county.name}: ${data.count?.toLocaleString?.() ?? '?'} total → ${maxPages} page(s)`)
          }
          for (const e of data.results) {
            const n = normalize(e, county, category.propertyType)
            if (n) out.push(n)
          }
        } catch (err) {
          log(`  [${category.propertyType}] ${county.name} p${page}: ${err.message}`)
        }
        if (page < maxPages) await sleep(delay)
      }
      await sleep(delay)
    }
  }
  return out
}

export default { id: 'nekretnine.hr', name: 'Nekretnine.hr', scrape }
