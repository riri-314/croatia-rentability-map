// Source adapter: oglasnik.hr (Plavi oglasnik) — a client-side SPA behind
// Cloudflare, so we drive a real browser via Playwright instead of fetching HTML.
//
// Unlike nekretnine.hr, oglasnik doesn't expose coordinates or bedroom counts in
// its listing cards, so this adapter:
//   • extracts title / size / location / price / link from the rendered DOM,
//   • keeps only the four Dalmatian counties (filtered from the location text),
//   • derives bedrooms from the Croatian title (or estimates from size),
//   • geocodes the town to lat/lng (cached) so it can go on the map.
//
// Requires Playwright + Chromium:  npx playwright install chromium

import { geocode } from '../lib/geocode.mjs'

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const CATEGORIES = [
  { path: 'stanovi-prodaja', propertyType: 'apartment' },
  { path: 'kuce-prodaja', propertyType: 'house' },
]

// Dalmatian counties as oglasnik writes them (diacritic-insensitive match).
const DALMATIA = {
  'splitsko-dalmatinska': 'Splitsko-dalmatinska',
  'zadarska': 'Zadarska',
  'sibensko-kninska': 'Šibensko-kninska',
  'dubrovacko-neretvanska': 'Dubrovačko-neretvanska',
}
const deaccent = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function parsePrice(text) {
  // e.g. "162.412 €" → 162412
  const m = (text || '').match(/([\d.\s]+)\s*€/)
  if (!m) return null
  return parseInt(m[1].replace(/[.\s]/g, ''), 10) || null
}
function parseSize(text) {
  const m = (text || '').match(/(\d+(?:[.,]\d+)?)\s*m²/)
  return m ? Math.round(parseFloat(m[1].replace(',', '.'))) : null
}

// Croatian room words → bedrooms; fall back to a size-based estimate.
function parseBedrooms(title, sizeM2) {
  const t = deaccent(title)
  if (/garsonijer|garsonjer|studio/.test(t)) return 1
  if (/(jednosob|1-sob|1 sob|1sob|jednoiposob)/.test(t)) return 1
  if (/(dvosob|2-sob|2 sob|2sob|dvoiposob)/.test(t)) return 2
  if (/(trosob|3-sob|3 sob|3sob|troiposob)/.test(t)) return 3
  if (/(cetverosob|4-sob|4 sob|4sob)/.test(t)) return 4
  if (/(peterosob|5-sob|5 sob|5sob)/.test(t)) return 5
  if (sizeM2) return Math.min(5, Math.max(1, Math.round((sizeM2 - 15) / 22)))
  return 2
}

function seaSignals(title) {
  const t = deaccent(title)
  const seaView = /pogled na more|uz more|more|plaz|prvi red/.test(t)
  const m = t.match(/(\d{1,4})\s*m\s*(?:od|do)\s*(?:mora|plaze)/)
  const distanceToSea = m ? parseInt(m[1], 10) : seaView ? 250 : 900
  return { seaView: seaView || distanceToSea < 300, distanceToSea }
}

function idFromHref(href) {
  const m = (href || '').match(/oglas-(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

async function scrape({ pages = 3, delay = 1500, log = console.log } = {}) {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    log('  Playwright not installed — run: npm i -D playwright && npx playwright install chromium')
    return []
  }

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ userAgent: UA, locale: 'hr-HR', viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  const out = []
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  try {
    for (const cat of CATEGORIES) {
      for (let pg = 1; pg <= pages; pg++) {
        const url = `https://oglasnik.hr/${cat.path}?sort=newest&page=${pg}`
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
          await page.waitForSelector('a[href*="-oglas-"]', { timeout: 15000 })
        } catch (e) {
          log(`  [${cat.propertyType}] page ${pg}: ${e.message.split('\n')[0]}`)
          continue
        }

        // Pull one record per card straight from the rendered DOM.
        const cards = await page.evaluate(() => {
          const seen = new Set()
          const rows = []
          for (const a of document.querySelectorAll('a[href*="-oglas-"]')) {
            const card = a.closest('[class*=product]') || a
            const href = a.getAttribute('href')
            if (!href || seen.has(href)) continue
            seen.add(href)
            const img = card.querySelector('img[alt]')
            rows.push({
              href,
              title: img?.getAttribute('alt') || a.innerText.slice(0, 120),
              text: card.innerText.replace(/\s+/g, ' ').trim(),
            })
          }
          return rows
        })

        let kept = 0
        for (const c of cards) {
          const price = parsePrice(c.text)
          const sizeM2 = parseSize(c.text)
          if (!price || !sizeM2 || price < 15000 || sizeM2 < 12 || sizeM2 > 2000) continue

          // County is the part of the location text matching a Dalmatian county.
          const flat = deaccent(c.text)
          const countyKey = Object.keys(DALMATIA).find((k) => flat.includes(k))
          if (!countyKey) continue // not Dalmatia

          // City = token right after the county name in the original text.
          const province = DALMATIA[countyKey]
          const locMatch = c.text.match(new RegExp(`[^|,]*${DALMATIA[countyKey][0]}[^|,]*,\\s*([^|€]+)`, 'i'))
          const city = (locMatch?.[1] || '').trim().replace(/\s+\d.*$/, '') || province

          const geo = await geocode(city, province, { delay })
          if (!geo) continue // can't place on map without coords

          const bedrooms = parseBedrooms(c.title, sizeM2)
          const { seaView, distanceToSea } = seaSignals(c.title)
          out.push({
            id: idFromHref(c.href),
            source: 'oglasnik.hr',
            propertyType: cat.propertyType,
            city,
            province,
            region: 'Dalmacija',
            title: c.title,
            address: `${city}, ${province}`,
            lat: geo.lat,
            lng: geo.lng,
            price,
            sizeM2,
            bedrooms,
            condition: 'Good',
            conditionFactor: 1.0,
            seaView,
            distanceToSea,
            url: `https://oglasnik.hr${c.href}`,
          })
          kept++
        }
        log(`  [${cat.propertyType}] page ${pg}: ${cards.length} cards → ${kept} Dalmatia`)
        await sleep(delay)
      }
    }
  } finally {
    await browser.close()
  }
  return out
}

export default { id: 'oglasnik.hr', name: 'Oglasnik.hr (browser)', scrape }
