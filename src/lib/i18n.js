// Centralized French labels + formatting for the UI.

// Condition values are stored in English in the data; translate at display time.
const CONDITION_FR = {
  'New / renovated': 'Neuf / rénové',
  Renovated: 'Rénové',
  Good: 'Bon état',
  'Needs work': 'À rénover',
}
export const conditionFr = (c) => CONDITION_FR[c] || c

// Market verdict keys → French. Includes the comparison preposition.
const VERDICT_FR = {
  above: 'au-dessus de',
  below: 'en dessous de',
  inline: 'conforme à',
  none: 'aucun comparable',
}
export const verdictFr = (v) => VERDICT_FR[v] || v

// Short verdict adjective for the sidebar chip.
const VERDICT_SHORT_FR = {
  above: 'au-dessus',
  below: 'en dessous',
  inline: 'dans la moyenne',
  none: 'pas de comparables',
}
export const verdictShortFr = (v) => VERDICT_SHORT_FR[v] || v

// Sort options (key + French label).
export const SORT_OPTIONS = [
  { key: 'payback',     label: 'Amortissement (croissant)' },
  { key: 'priceAsc',    label: 'Prix (croissant)' },
  { key: 'priceDesc',   label: 'Prix (décroissant)' },
  { key: 'yieldDesc',   label: 'Rendement net (décroissant)' },
  { key: 'sizeDesc',    label: 'Surface (décroissant)' },
  { key: 'nightlyDesc', label: 'Tarif/nuit (décroissant)' },
]

export function sortResults(list, sortBy) {
  const by = {
    payback: (a, b) => a.analysis.paybackYears - b.analysis.paybackYears,
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    yieldDesc: (a, b) => b.analysis.netYield - a.analysis.netYield,
    sizeDesc: (a, b) => b.sizeM2 - a.sizeM2,
    nightlyDesc: (a, b) => b.analysis.nightly - a.analysis.nightly,
  }
  return [...list].sort(by[sortBy] || by.payback)
}

// Format an ISO timestamp as a readable French date-time.
export function fmtDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return null
  }
}

// "il y a 3 h" style relative age.
export function fmtAge(iso, nowMs) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (isNaN(then)) return null
  const mins = Math.max(0, Math.round((nowMs - then) / 60000))
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `il y a ${hrs} h`
  const days = Math.round(hrs / 24)
  return `il y a ${days} j`
}
