// Chooses the active dataset: real scraped listings if present, else demo data.
//
// `scraped-listings.json` is produced by `node scraper/scrape.mjs`. It may be
// either the wrapped shape { scrapedAt, source, listings } or a bare array
// (older runs) — we handle both. This bundled import is the fallback used when
// the runtime /api/data endpoint isn't available (e.g. a static build).
import { LISTINGS as DEMO } from './listings.js'
import scraped from './scraped-listings.json'

const arr = Array.isArray(scraped) ? scraped : scraped?.listings
const hasReal = Array.isArray(arr) && arr.length > 0

export const ACTIVE_LISTINGS = hasReal ? arr : DEMO
export const USING_REAL_DATA = hasReal
export const SCRAPED_AT = (!Array.isArray(scraped) && scraped?.scrapedAt) || null
export const DATA_SOURCE = hasReal ? 'nekretnine.hr' : 'échantillon démo'
