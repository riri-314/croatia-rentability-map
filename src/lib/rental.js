// Seasonal short-term (holiday) rental model for the Dalmatian coast.
//
// Dalmatia tourism is heavily seasonal. We split the year into three seasons,
// each with its own nightly-rate multiplier and realistic occupancy, then
// estimate gross income, subtract operating costs, and compute the payback
// period (price + acquisition costs) ÷ net annual income.

import { CITIES } from '../data/listings.js'

// Baseline nightly rate (€/night for a good-condition 1-bed) for real scraped
// data, where the city can be any Dalmatian town. Resolution order:
//   1. premium-town override  2. county/province default  3. global fallback.
const CITY_NIGHTLY_OVERRIDE = {
  Dubrovnik: 165, Hvar: 150, Bol: 120, Makarska: 95, Trogir: 100,
  Split: 110, Cavtat: 130, Orebić: 95, 'Stari Grad': 120, Korčula: 110,
  Primošten: 95, Vodice: 90, Rogoznica: 95, 'Brela': 105, Tučepi: 100,
}
const PROVINCE_NIGHTLY = {
  'Dubrovačko-neretvanska': 120,
  'Splitsko-dalmatinska': 100,
  'Šibensko-kninska': 88,
  Zadarska: 85,
}

function cityBaseNightly(listing) {
  if (CITY_NIGHTLY_OVERRIDE[listing.city]) return CITY_NIGHTLY_OVERRIDE[listing.city]
  if (CITIES[listing.city]) return CITIES[listing.city].nightly // demo dataset
  if (listing.province && PROVINCE_NIGHTLY[listing.province])
    return PROVINCE_NIGHTLY[listing.province]
  return 90
}

// Season definition: nights available, rate multiplier vs. baseline, occupancy.
export const SEASONS = [
  { key: 'peak',     label: 'Haute (juil.–août)',            nights: 62,  rateMult: 1.6, occupancy: 0.88 },
  { key: 'shoulder', label: 'Moyenne (mai–juin, sept.–oct.)', nights: 122, rateMult: 1.0, occupancy: 0.55 },
  { key: 'low',      label: 'Basse (nov.–avr.)',             nights: 181, rateMult: 0.6, occupancy: 0.18 },
]

// Operating-cost assumptions for short-term rental.
export const COSTS = {
  managementRate: 0.20, // agency / management fee on gross
  otherOpexRate: 0.15,  // cleaning, utilities, supplies, maintenance, listing fees
  acquisitionRate: 0.05, // ~3% RETT + agency + notary on purchase, capitalised once
}

// Estimate the baseline nightly rate for a specific apartment (good-condition
// 1-bed = city baseline; scaled by size/bedrooms, condition, and sea view).
export function baselineNightly(listing) {
  const base = cityBaseNightly(listing)

  // Each extra bedroom adds capacity → higher nightly rate, with diminishing returns.
  const bedroomFactor = 1 + (listing.bedrooms - 1) * 0.32
  const conditionFactor = listing.conditionFactor ?? 1
  const seaFactor = listing.seaView ? 1.12 : 1
  const proximityFactor = listing.distanceToSea < 300 ? 1.08 : 1
  // Houses/villas (more private space, often a pool/garden) command a premium.
  const typeFactor = listing.propertyType === 'house' ? 1.1 : 1

  return Math.round(base * bedroomFactor * conditionFactor * seaFactor * proximityFactor * typeFactor)
}

// Full seasonal projection for one listing.
export function analyzeListing(listing) {
  const nightly = baselineNightly(listing)

  let grossAnnual = 0
  const seasonBreakdown = SEASONS.map((s) => {
    const seasonRate = Math.round(nightly * s.rateMult)
    const bookedNights = Math.round(s.nights * s.occupancy)
    const income = seasonRate * bookedNights
    grossAnnual += income
    return { ...s, seasonRate, bookedNights, income }
  })

  const opex = grossAnnual * (COSTS.managementRate + COSTS.otherOpexRate)
  const netAnnual = Math.round(grossAnnual - opex)

  const acquisitionCost = listing.price * COSTS.acquisitionRate
  const totalInvested = listing.price + acquisitionCost

  const paybackYears = netAnnual > 0 ? totalInvested / netAnnual : Infinity
  const grossYield = listing.price > 0 ? grossAnnual / listing.price : 0
  const netYield = listing.price > 0 ? netAnnual / listing.price : 0

  return {
    nightly,                       // suggested baseline nightly rate
    peakNightly: Math.round(nightly * SEASONS[0].rateMult),
    seasonBreakdown,
    grossAnnual: Math.round(grossAnnual),
    netAnnual,
    totalInvested: Math.round(totalInvested),
    paybackYears,
    grossYield,
    netYield,
  }
}

// Compare a listing's suggested nightly rate against the average nightly rate
// of SIMILAR properties (same city, type, and bedroom count) in the dataset.
export function compareToMarket(listing, allListings) {
  const peers = allListings.filter(
    (l) =>
      l.city === listing.city &&
      l.bedrooms === listing.bedrooms &&
      (l.propertyType || null) === (listing.propertyType || null) &&
      l.id !== listing.id,
  )
  if (peers.length === 0) {
    return { peerCount: 0, avgNightly: null, deltaPct: 0, verdict: 'none' }
  }
  const avgNightly =
    peers.reduce((sum, l) => sum + baselineNightly(l), 0) / peers.length
  const mine = baselineNightly(listing)
  const deltaPct = (mine - avgNightly) / avgNightly

  // verdict is a stable key (used for CSS + i18n lookup), not display text.
  let verdict = 'inline'
  if (deltaPct > 0.05) verdict = 'above'
  else if (deltaPct < -0.05) verdict = 'below'

  return { peerCount: peers.length, avgNightly: Math.round(avgNightly), deltaPct, verdict }
}

// Filter + score listings against the user's budget and payback target.
export function evaluate(listings, { budget, targetPaybackYears }) {
  return listings
    .filter((l) => l.price <= budget)
    .map((l) => {
      const analysis = analyzeListing(l)
      const market = compareToMarket(l, listings)
      const meetsTarget = analysis.paybackYears <= targetPaybackYears
      return { ...l, analysis, market, meetsTarget }
    })
    .sort((a, b) => a.analysis.paybackYears - b.analysis.paybackYears)
}

export function fmtEur(n) {
  if (n == null || !isFinite(n)) return '—'
  return '€' + Math.round(n).toLocaleString('en-US')
}
