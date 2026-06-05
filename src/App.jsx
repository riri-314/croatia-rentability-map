import React, { useEffect, useMemo, useState } from 'react'
import {
  ACTIVE_LISTINGS,
  USING_REAL_DATA,
  DATA_SOURCE,
  SCRAPED_AT,
} from './data/dataset.js'
import { evaluate } from './lib/rental.js'
import { sortResults } from './lib/i18n.js'
import Sidebar from './components/Sidebar.jsx'
import MapView from './components/MapView.jsx'

export default function App() {
  // --- investment inputs ---
  const [budget, setBudget] = useState(250000)
  const [targetPaybackYears, setTargetPaybackYears] = useState(12)

  // --- search / filter / sort ---
  const [query, setQuery] = useState('')
  const [cityFilter, setCityFilter] = useState('all')
  const [minBedrooms, setMinBedrooms] = useState(0)
  const [seaOnly, setSeaOnly] = useState(false)
  const [sortBy, setSortBy] = useState('payback')

  const [selectedId, setSelectedId] = useState(null)

  // --- dataset (loaded at runtime so refetch updates without rebuild) ---
  const [dataset, setDataset] = useState({
    listings: ACTIVE_LISTINGS,
    scrapedAt: SCRAPED_AT,
    source: DATA_SOURCE,
    real: USING_REAL_DATA,
  })
  const [refetching, setRefetching] = useState(false)
  const [refetchError, setRefetchError] = useState(null)

  // On mount, pull fresh data from the dev API; fall back to bundled data.
  useEffect(() => {
    let cancelled = false
    fetch('/api/data')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled || !d?.listings?.length) return
        setDataset({ listings: d.listings, scrapedAt: d.scrapedAt, source: d.source || 'nekretnine.hr', real: true })
      })
      .catch(() => {/* keep bundled fallback */})
    return () => { cancelled = true }
  }, [])

  async function refetch() {
    setRefetching(true)
    setRefetchError(null)
    try {
      const r = await fetch('/api/refetch?pages=4', { method: 'POST' })
      const d = await r.json()
      if (!r.ok || !d?.listings?.length) throw new Error(d?.error || 'Échec de la récupération')
      setDataset({ listings: d.listings, scrapedAt: d.scrapedAt, source: d.source || 'nekretnine.hr', real: true })
    } catch (e) {
      setRefetchError(
        e.message?.includes('JSON') || e.message?.includes('fetch')
          ? "Indisponible (lancez l'app avec « npm run dev »)"
          : e.message,
      )
    } finally {
      setRefetching(false)
    }
  }

  // Score every listing against the investment inputs.
  const scored = useMemo(
    () => evaluate(dataset.listings, { budget, targetPaybackYears }),
    [dataset.listings, budget, targetPaybackYears],
  )

  // City list for the filter dropdown.
  const cities = useMemo(
    () => [...new Set(dataset.listings.map((l) => l.city))].sort((a, b) => a.localeCompare(b, 'fr')),
    [dataset.listings],
  )

  // Apply search + filters + sort.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = scored.filter((r) => {
      if (cityFilter !== 'all' && r.city !== cityFilter) return false
      if (minBedrooms > 0 && (r.bedrooms || 0) < minBedrooms) return false
      if (seaOnly && !r.seaView) return false
      if (q && !`${r.title} ${r.city} ${r.address}`.toLowerCase().includes(q)) return false
      return true
    })
    return sortResults(filtered, sortBy)
  }, [scored, query, cityFilter, minBedrooms, seaOnly, sortBy])

  const matching = results.filter((r) => r.meetsTarget)
  const selected = results.find((r) => r.id === selectedId) || null

  return (
    <div className="app">
      <Sidebar
        budget={budget}
        setBudget={setBudget}
        targetPaybackYears={targetPaybackYears}
        setTargetPaybackYears={setTargetPaybackYears}
        query={query}
        setQuery={setQuery}
        cities={cities}
        cityFilter={cityFilter}
        setCityFilter={setCityFilter}
        minBedrooms={minBedrooms}
        setMinBedrooms={setMinBedrooms}
        seaOnly={seaOnly}
        setSeaOnly={setSeaOnly}
        sortBy={sortBy}
        setSortBy={setSortBy}
        results={results}
        matching={matching}
        totalCount={dataset.listings.length}
        selectedId={selectedId}
        onSelect={setSelectedId}
        usingReal={dataset.real}
      />
      <MapView
        results={results}
        selectedId={selectedId}
        onSelect={setSelectedId}
        selected={selected}
        source={dataset.source}
        usingReal={dataset.real}
        scrapedAt={dataset.scrapedAt}
        onRefetch={refetch}
        refetching={refetching}
        refetchError={refetchError}
      />
    </div>
  )
}
