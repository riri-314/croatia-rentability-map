// City → lat/lng geocoding via OpenStreetMap Nominatim, with an on-disk cache.
//
// Some sources (e.g. oglasnik.hr) give only a place name, not coordinates. We
// geocode the "city, county, Croatia" string once and cache the result, so
// repeated towns cost nothing and we stay well within Nominatim's usage policy
// (<=1 req/s, identifying User-Agent). Cache lives at scraper/geocache.json.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = join(__dirname, '..', 'geocache.json')
const UA = 'dalmatia-rentability-map/1.0 (personal research; contact via repo)'

let cache = null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function loadCache() {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(CACHE_FILE, 'utf8'))
  } catch {
    cache = {}
  }
  return cache
}

async function saveCache() {
  await mkdir(dirname(CACHE_FILE), { recursive: true })
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2))
}

// Returns { lat, lng } or null. Throttles live lookups via `delay` ms.
export async function geocode(city, county, { delay = 1100 } = {}) {
  await loadCache()
  const key = `${city || ''}|${county || ''}`.toLowerCase().trim()
  if (key in cache) return cache[key] // includes cached null misses

  const q = [city, county, 'Croatia'].filter(Boolean).join(', ')
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`
  let result = null
  try {
    await sleep(delay) // be polite — Nominatim allows ~1 req/s
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'hr,en' } })
    if (res.ok) {
      const arr = await res.json()
      if (arr[0]) result = { lat: Number(arr[0].lat), lng: Number(arr[0].lon) }
    }
  } catch {
    /* leave null */
  }
  cache[key] = result
  await saveCache()
  return result
}
