# Rentabilité Dalmatie — Dalmatia Apartment Rentability Map

An interactive map for finding apartments to buy along the **Dalmatian coast of Croatia**,
scored by how quickly they'd pay themselves off as **seasonal holiday rentals**.

You set a **budget** and a **target payback period**; the app shows every matching
apartment on a map, suggests a nightly rent, estimates the payback time, and tells
you whether that rent is **above or below** comparable apartments nearby.

> The interface is in **French**. Listing data is scraped live from [nekretnine.hr](https://www.nekretnine.hr).

## Features

- 🗺️ **Interactive map** (Leaflet + OpenStreetMap) with colour-coded markers
  — green = meets your payback target, amber = within budget but slower.
- 🎚️ **Budget & payback sliders** — everything recomputes live.
- 🔎 **Search, filter & sort** — by city, bedrooms, sea view; sort by payback,
  price, net yield, size, or nightly rate.
- 🏖️ **Seasonal tourist-rental model** — splits the year into peak / shoulder /
  low season with realistic nightly rates and occupancy, nets out operating
  costs, and computes payback years + net yield.
- 📊 **Peer comparison** — flags whether the suggested rent is above/below the
  average of similar apartments (same city, same bedroom count).
- 🔄 **Live data + refetch** — see when data was fetched and re-scrape on demand.
- 🏠 **Apartments + houses**, filterable by property type and data source.
- 🔌 **Pluggable scraper** — add a new portal by dropping in one source adapter.

## Tech stack

- **React 18** + **Vite**
- **Leaflet** / **react-leaflet** for the map
- A **Node.js scraper** (no dependencies) that reads the structured data
  embedded in nekretnine.hr search pages
- A small **Vite dev-server API** for live data loading and refetch

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server at http://localhost:5173
```

Then open http://localhost:5173. The app loads listings from
`src/data/scraped-listings.json` (committed, so it works out of the box).

### Other commands

```bash
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Refreshing the data

The dataset is produced by the scraper. Refresh it in two ways:

- **From the UI** — click **« Actualiser les données »** on the map (works under
  `npm run dev`, which exposes the refetch endpoint).
- **From the CLI**:

  ```bash
  node scraper/scrape.mjs                 # ~300 listings (default, 3 pages/county)
  node scraper/scrape.mjs --pages 10      # deeper
  node scraper/scrape.mjs --pages 264     # a county's full depth
  node scraper/scrape.mjs --delay 2000    # ms between requests (be polite)
  ```

See [`scraper/README.md`](scraper/README.md) for how the scraper works and its
politeness/legality notes.

## Project structure

```
├── index.html
├── vite.config.js          # Vite config + dev API (/api/data, /api/refetch)
├── scraper/
│   ├── scrape.mjs           # orchestrator: runs sources, merges, dedupes
│   ├── sources/
│   │   └── nekretnine.mjs    # source adapter (apartments + houses)
│   └── README.md
└── src/
    ├── App.jsx              # state: budget, filters, data loading, refetch
    ├── components/
    │   ├── Sidebar.jsx      # inputs, search/filter/sort, results list
    │   └── MapView.jsx      # Leaflet map, markers, listing popups
    ├── lib/
    │   ├── rental.js        # seasonal rental model + scoring
    │   └── i18n.js          # French labels & formatting
    └── data/
        ├── dataset.js       # picks scraped data, falls back to demo
        ├── listings.js      # synthetic demo dataset (fallback)
        └── scraped-listings.json   # real scraped listings
```

## How the model works

For each apartment, expected annual income is estimated across three seasons:

| Season  | Period            | Rate vs. base | Occupancy |
|---------|-------------------|:-------------:|:---------:|
| Peak    | Jul–Aug           | ×1.6          | 88%       |
| Shoulder| May–Jun, Sep–Oct  | ×1.0          | 55%       |
| Low     | Nov–Apr           | ×0.6          | 18%       |

The baseline nightly rate is derived from the city (or county) and adjusted for
bedrooms, condition, sea view, and proximity to the water. After subtracting
management + operating costs, **payback = (price + acquisition costs) ÷ net
annual income**. Assumptions live in [`src/lib/rental.js`](src/lib/rental.js)
and are easy to tune.

## Disclaimer

Rent figures are **model-based estimates applied to real sale prices** — not
investment advice, and not affiliated with nekretnine.hr. Use the scraper
responsibly and respect the source site's Terms of Service.
