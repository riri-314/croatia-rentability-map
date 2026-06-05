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

> Note on other Croatian portals: Njuškalo, Realitica and **Crozilla** are
> bot-walled (Incapsula / CloudFront / Imperva reese84) and impractical even with
> a headless browser. **Oglasnik** is a Cloudflare-fronted SPA that a real browser
> *can* load — see the Playwright source below.

## The two sources

### nekretnine.hr

Each search-results page on nekretnine.hr (part of the immobiliare.it network)
embeds a Next.js `__NEXT_DATA__` JSON blob with the **full structured listing
data** — price, surface, rooms, condition, and real lat/lng coordinates. The
adapter reads that JSON directly rather than parsing HTML, so it's robust to
visual/markup changes. It covers two categories — apartments (`prodaja-stanovi`)
and detached houses (`prodaja-samostojeca-kuce`) — across all four counties:
Split-Dalmatia, Dubrovnik-Neretva, Šibenik-Knin, Zadar.

### oglasnik.hr (headless browser)

Oglasnik is a Cloudflare-fronted SPA, so this adapter drives **Chromium via
Playwright**, reads the rendered listing cards, keeps only the four Dalmatian
counties, derives bedrooms from the Croatian title (or estimates from size), and
**geocodes** each town to coordinates via OpenStreetMap Nominatim (cached in
`geocache.json`). It's slower than the HTTP source, so it's opt-in.

**Prerequisite** (one-time):

```bash
npm install                      # installs playwright (devDependency)
npx playwright install chromium  # downloads the browser (~120 MB)
```

Run it on its own — merge mode keeps the other source's listings:

```bash
node scraper/scrape.mjs --source oglasnik.hr --pages 5
```

## Usage

```bash
node scraper/scrape.mjs                       # 3 pages/category/county, default
node scraper/scrape.mjs --pages 10            # deeper
node scraper/scrape.mjs --pages 264           # a category's full depth
node scraper/scrape.mjs --delay 2000          # ms between requests (default 1500)
node scraper/scrape.mjs --source nekretnine.hr  # only one source
node scraper/scrape.mjs --replace               # full overwrite (don't merge)
```

Running a **subset** of sources merges with the existing data file: it refreshes
the sources you ran and keeps listings from the others. Use `--replace` to force
a clean overwrite instead.

After scraping, the dev server hot-reloads with the new data (or rebuild with
`npm run build`).

## Politeness & legality

- Sends an identifying User-Agent and a configurable delay between requests.
- Only fetches the public SEO category pages (`/prodaja-stanovi/<county>/`),
  which are **not** disallowed by the site's `robots.txt` (only `/search-map`,
  `/ricerca.php`, `/dettaglio.php` etc. are).
- For personal research use. Respect each site's Terms of Service; don't hammer
  them (keep `--pages` modest). Not affiliated with nekretnine.hr or oglasnik.hr.
- Geocoding uses OpenStreetMap **Nominatim** with an identifying User-Agent,
  ≤1 request/second, and an on-disk cache so towns are looked up only once.

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
