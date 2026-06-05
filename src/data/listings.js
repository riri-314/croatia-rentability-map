// Demo dataset of apartments for sale across the Dalmatia region of Croatia.
//
// This is realistic SAMPLE data, generated deterministically so the map is
// stable between reloads. Each city has rough benchmarks for sale price (€/m²)
// and short-term holiday rental nightly rate (€/night for a baseline 1-bed,
// good-condition apartment). Listings are scattered around the city centre.
//
// To plug in real data later, replace `LISTINGS` with objects of the same shape.

// Per-city anchors: coordinates, sale price €/m², baseline nightly rate €/night.
export const CITIES = {
  Split:      { lat: 43.5081, lng: 16.4402, eurPerM2: 4200, nightly: 110, blurb: 'Largest Dalmatian city, year-round demand' },
  Dubrovnik:  { lat: 42.6507, lng: 18.0944, eurPerM2: 6800, nightly: 165, blurb: 'Premium UNESCO old town, top nightly rates' },
  Hvar:       { lat: 43.1729, lng: 16.4413, eurPerM2: 5200, nightly: 150, blurb: 'Glamour island, strong summer premium' },
  Zadar:      { lat: 44.1194, lng: 15.2314, eurPerM2: 3300, nightly: 90,  blurb: 'Historic peninsula, growing tourism' },
  'Šibenik':  { lat: 43.7350, lng: 15.8952, eurPerM2: 3000, nightly: 85,  blurb: 'Two UNESCO sites, value entry point' },
  Trogir:     { lat: 43.5125, lng: 16.2517, eurPerM2: 3800, nightly: 100, blurb: 'UNESCO island town near Split airport' },
  Makarska:   { lat: 43.2969, lng: 17.0178, eurPerM2: 3600, nightly: 95,  blurb: 'Riviera beach resort under Biokovo' },
  Bol:        { lat: 43.2619, lng: 16.6552, eurPerM2: 4400, nightly: 120, blurb: 'Brač island, Zlatni Rat beach' },
  'Omiš':     { lat: 43.4447, lng: 16.6892, eurPerM2: 3100, nightly: 88,  blurb: 'River-meets-sea, adventure tourism' },
  'Primošten':{ lat: 43.5858, lng: 15.9244, eurPerM2: 3400, nightly: 95,  blurb: 'Picturesque peninsula, family resort' },
}

// Small deterministic PRNG (mulberry32) so listings don't shuffle on reload.
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CONDITIONS = [
  { label: 'New / renovated', factor: 1.18 },
  { label: 'Good',            factor: 1.0 },
  { label: 'Needs work',      factor: 0.82 },
]

const STREETS = [
  'Obala', 'Riva', 'Ulica kralja Tomislava', 'Put Firula', 'Vukovarska',
  'Setaliste', 'Bana Jelačića', 'Domovinskog rata', 'Kralja Zvonimira', 'Trg',
]

function round(n, step) {
  return Math.round(n / step) * step
}

function buildListings() {
  const rand = mulberry32(20260605)
  const out = []
  let id = 1

  const perCity = 6 // 6 listings × 10 cities = 60 apartments
  for (const [city, c] of Object.entries(CITIES)) {
    for (let i = 0; i < perCity; i++) {
      const bedrooms = 1 + Math.floor(rand() * 4) // 1..4
      // Size correlates with bedrooms, with spread.
      const sizeM2 = round(28 + bedrooms * 18 + (rand() - 0.5) * 22, 1)
      const cond = CONDITIONS[Math.floor(rand() * CONDITIONS.length)]

      // Sale price: city €/m² × size × condition × small noise.
      const noise = 0.9 + rand() * 0.25
      const price = round(c.eurPerM2 * sizeM2 * cond.factor * noise, 1000)

      // Scatter around the centre (~within a few km).
      const lat = c.lat + (rand() - 0.5) * 0.045
      const lng = c.lng + (rand() - 0.5) * 0.055

      const seaView = rand() > 0.5
      const distanceToSea = round(50 + rand() * 1200, 10) // metres

      out.push({
        id: id++,
        city,
        title: `${bedrooms}-bed apartment, ${city}`,
        address: `${STREETS[Math.floor(rand() * STREETS.length)]} ${1 + Math.floor(rand() * 80)}, ${city}`,
        lat,
        lng,
        price,
        sizeM2,
        bedrooms,
        condition: cond.label,
        conditionFactor: cond.factor,
        seaView,
        distanceToSea,
      })
    }
  }
  return out
}

export const LISTINGS = buildListings()
