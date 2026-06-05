# Dalmatia listings scraper

Pulls real **apartment- and house-for-sale** listings across the four Dalmatian
counties and writes them to `../src/data/scraped-listings.json` in the exact
shape the app consumes. The app auto-prefers this file over demo data.

## Architecture: pluggable sources

`scrape.mjs` is an **orchestrator**. It runs one or more *source adapters* from
`sources/`, merges their results, and dedupes — both within a source (by id) and
across sources (same rounded coordinates + price = same property). The output
records each listing's `source` and `propertyType`, plus per-source counts.

A source adapter is a module that exports:

```js
export default {
  id: 'example.hr',
  name: 'Example.hr',
  async scrape({ pages, delay, log }) {
    // ...fetch + normalize...
    return listings // [{ id, source, propertyType, city, lat, lng, price, ... }]
  },
}
```

**To add a new portal:** create `sources/<name>.mjs` with that shape, then add it
to the `SOURCES` array in `scrape.mjs`. Nothing else changes — merge, dedupe,
the API, and the UI filters all pick it up automatically.

> Note: most other Croatian portals are impractical to scrape — Njuškalo and
> Realitica are bot-walled (Incapsula / CloudFront CAPTCHA), while Crozilla and
> Oglasnik are client-side SPAs with no server-rendered data. nekretnine.hr is
> the reliable source today; the adapter pattern is here so adding another is a
> drop-in when a viable one appears.

## The nekretnine.hr source

Each search-results page on nekretnine.hr (part of the immobiliare.it network)
embeds a Next.js `__NEXT_DATA__` JSON blob with the **full structured listing
data** — price, surface, rooms, condition, and real lat/lng coordinates. The
adapter reads that JSON directly rather than parsing HTML, so it's robust to
visual/markup changes. It covers two categories — apartments (`prodaja-stanovi`)
and detached houses (`prodaja-samostojeca-kuce`) — across all four counties:
Split-Dalmatia, Dubrovnik-Neretva, Šibenik-Knin, Zadar.

## Usage

```bash
node scraper/scrape.mjs                       # 3 pages/category/county, default
node scraper/scrape.mjs --pages 10            # deeper
node scraper/scrape.mjs --pages 264           # a category's full depth
node scraper/scrape.mjs --delay 2000          # ms between requests (default 1500)
node scraper/scrape.mjs --source nekretnine.hr  # only one source
```

After scraping, the dev server hot-reloads with the new data (or rebuild with
`npm run build`).

## Politeness & legality

- Sends an identifying User-Agent and a configurable delay between requests.
- Only fetches the public SEO category pages (`/prodaja-stanovi/<county>/`),
  which are **not** disallowed by the site's `robots.txt` (only `/search-map`,
  `/ricerca.php`, `/dettaglio.php` etc. are).
- For personal research use. Respect the site's Terms of Service; don't hammer
  it (keep `--pages` and concurrency modest). This is not affiliated with
  nekretnine.hr.

## Data shape (per listing)

```jsonc
{
  "id": 339521,
  "source": "nekretnine.hr",
  "propertyType": "apartment",   // or "house"
  "city": "Podgora",
  "province": "Splitsko-dalmatinska",
  "region": "Dalmacija",
  "title": "Stan novo, na više razina, Podgora",
  "address": "Porat, Drašnice",
  "lat": 43.2176, "lng": 17.1101,
  "price": 990000,
  "sizeM2": 220,
  "bedrooms": 4,
  "condition": "New / renovated", "conditionFactor": 1.18,
  "seaView": true, "distanceToSea": 100,
  "url": "https://www.nekretnine.hr/oglasi/339521/"
}
```
