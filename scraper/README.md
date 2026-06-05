# Dalmatia listings scraper

Pulls real apartment-for-sale listings across the four Dalmatian counties from
**nekretnine.hr** and writes them to `../src/data/scraped-listings.json` in the
exact shape the app consumes. The app auto-prefers this file over demo data.

## How it works

Each search-results page on nekretnine.hr (part of the immobiliare.it network)
embeds a Next.js `__NEXT_DATA__` JSON blob with the **full structured listing
data** — price, surface, rooms, condition, and real lat/lng coordinates. The
scraper reads that JSON directly rather than parsing HTML, so it's robust to
visual/markup changes.

Counties covered: Split-Dalmatia, Dubrovnik-Neretva, Šibenik-Knin, Zadar.

## Usage

```bash
node scraper/scrape.mjs                 # 3 pages/county (~300 listings), default
node scraper/scrape.mjs --pages 10      # deeper
node scraper/scrape.mjs --pages 264     # a county's full depth
node scraper/scrape.mjs --delay 2000    # ms between requests (default 1500)
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
