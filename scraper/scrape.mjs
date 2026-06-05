#!/usr/bin/env node
// Multi-source Dalmatia listings scraper (orchestrator).
//
// Registers one or more "source adapters" (see ./sources/*.mjs), runs them,
// merges + dedupes the results, and writes src/data/scraped-listings.json in
// the shape the app consumes.
//
// To add a new source: create ./sources/<name>.mjs exporting
//   { id, name, scrape({ pages, delay, log }) -> listing[] }
// and add it to the SOURCES array below. Everything else is automatic.
//
// Usage:
//   node scraper/scrape.mjs                 # 3 pages/category/county per source
//   node scraper/scrape.mjs --pages 10      # deeper
//   node scraper/scrape.mjs --source nekretnine.hr   # only one source
//   node scraper/scrape.mjs --delay 2000    # ms between requests

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import nekretnine from './sources/nekretnine.mjs'

// --- registered sources ---
const SOURCES = [nekretnine]

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'src', 'data', 'scraped-listings.json')

function arg(flag, def) {
  const i = process.argv.indexOf(flag)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const MAX_PAGES = parseInt(arg('--pages', '3'), 10)
const DELAY_MS = parseInt(arg('--delay', '1500'), 10)
const ONLY_SOURCE = arg('--source', null)

// Cross-source near-duplicate key: same rounded location + same price likely
// means the same property listed on two portals. Within a source we also dedupe
// by stable id.
const dupKey = (l) => `${l.lat.toFixed(3)},${l.lng.toFixed(3)},${l.price}`

async function main() {
  const active = SOURCES.filter((s) => !ONLY_SOURCE || s.id === ONLY_SOURCE)
  if (!active.length) {
    console.error(`No source matches "${ONLY_SOURCE}". Known: ${SOURCES.map((s) => s.id).join(', ')}`)
    process.exit(1)
  }
  console.log(`Scraping ${active.length} source(s): ${active.map((s) => s.id).join(', ')}`)
  console.log(`Up to ${MAX_PAGES} page(s) per category/county, ${DELAY_MS}ms apart\n`)

  const byId = new Map() // `${source}:${id}` -> listing
  const seen = new Set() // cross-source near-dup keys
  const perSource = {}

  for (const source of active) {
    console.log(`▸ ${source.name} (${source.id})`)
    let kept = 0
    let listings = []
    try {
      listings = await source.scrape({ pages: MAX_PAGES, delay: DELAY_MS, log: console.log })
    } catch (err) {
      console.warn(`  source failed: ${err.message}`)
    }
    for (const l of listings) {
      const idKey = `${l.source}:${l.id}`
      if (byId.has(idKey)) continue
      const dk = dupKey(l)
      if (seen.has(dk)) continue // same property already taken from another source
      byId.set(idKey, l)
      seen.add(dk)
      kept++
    }
    perSource[source.id] = kept
    console.log(`  → ${kept} unique listings from ${source.name}\n`)
  }

  const listings = [...byId.values()]
  await mkdir(dirname(OUT), { recursive: true })
  const payload = {
    scrapedAt: new Date().toISOString(),
    sources: Object.entries(perSource).map(([id, count]) => ({ id, count })),
    count: listings.length,
    listings,
  }
  await writeFile(OUT, JSON.stringify(payload, null, 2))

  // summary
  const byType = {}
  const byCity = {}
  for (const l of listings) {
    byType[l.propertyType] = (byType[l.propertyType] || 0) + 1
    byCity[l.city] = (byCity[l.city] || 0) + 1
  }
  const topCities = Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 10)
  console.log(`✓ Wrote ${listings.length} listings → ${OUT}`)
  console.log('By source:', Object.entries(perSource).map(([s, n]) => `${s}(${n})`).join(', '))
  console.log('By type:', Object.entries(byType).map(([t, n]) => `${t}(${n})`).join(', '))
  console.log('Top cities:', topCities.map(([c, n]) => `${c}(${n})`).join(', '))
}

main().catch((e) => { console.error(e); process.exit(1) })
