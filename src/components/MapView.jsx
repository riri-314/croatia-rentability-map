import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { fmtEur } from '../lib/rental.js'
import { conditionFr, verdictFr, typeFr, fmtDate } from '../lib/i18n.js'

// Dalmatia roughly centred.
const CENTER = [43.5, 16.6]
const ZOOM = 8

// The refetch backend (/api/refetch) only exists under the local dev server.
// In a deployed/static build (e.g. Firebase Hosting) there's no backend, so hide
// the button there.
const IS_LOCAL =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)

// Estimated popup height (carousel + details). Used to leave room above the
// marker so the whole card is visible.
const POPUP_H = 520

function FlyToSelected({ selected }) {
  const map = useMap()
  useEffect(() => {
    if (!selected) return
    // Defer so that on mobile (where the map was just un-hidden) it has its real
    // size before we measure — otherwise positioning is computed against 0px.
    const t = setTimeout(() => {
      const z = Math.max(map.getZoom(), 12)
      const size = map.getSize()
      const mPix = map.project([selected.lat, selected.lng], z)
      // Place the marker low enough that the card (which opens upward) clears the
      // top — but never below the bottom overlays. Clamp to the viewport.
      const desiredY = Math.min(size.y - 90, POPUP_H + 110)
      const centerPix = [mPix.x, mPix.y - (desiredY - size.y / 2)]
      const center = map.unproject(centerPix, z)
      map.flyTo(center, z, { duration: 0.6 })
    }, 260)
    return () => clearTimeout(t)
  }, [selected, map])
  return null
}

// On mobile the map is hidden (display:none) while the list is shown; Leaflet
// then renders gray tiles because it measured a zero-size container. Recompute
// its size whenever the map becomes the active view.
function InvalidateOnShow({ view }) {
  const map = useMap()
  useEffect(() => {
    if (view === 'map') {
      const t = setTimeout(() => map.invalidateSize(), 220)
      return () => clearTimeout(t)
    }
  }, [view, map])
  return null
}

function markerColor(r) {
  if (r.meetsTarget) return '#16a34a' // vert — atteint l'objectif d'amortissement
  return '#d97706' // ambre — dans le budget mais amortissement plus lent
}

export default function MapView({
  results,
  selectedId,
  onSelect,
  selected,
  source,
  usingReal,
  scrapedAt,
  onRefetch,
  refetching,
  refetchError,
  mobileView,
}) {
  const when = fmtDate(scrapedAt)
  return (
    <div className="map-wrap">
      <div className="data-panel">
        <div className={'data-badge' + (usingReal ? ' live' : '')}>
          <i className="badge-dot" />
          {usingReal ? 'Données en direct' : 'Données démo'}
          {source ? ` · ${source}` : ''}
        </div>
        <div className="data-meta">
          {when ? `Récupérées le ${when}` : 'Date de récupération inconnue'}
        </div>
        {IS_LOCAL && (
          <>
            <button className="refetch-btn" onClick={onRefetch} disabled={refetching}>
              {refetching ? '⟳ Récupération…' : '⟳ Actualiser les données'}
            </button>
            {refetchError && <div className="data-error">{refetchError}</div>}
          </>
        )}
      </div>

      <MapContainer center={CENTER} zoom={ZOOM} className="map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToSelected selected={selected} />
        <InvalidateOnShow view={mobileView} />

        {results.map((r) => {
          const isSel = r.id === selectedId
          return (
            <CircleMarker
              key={r.id}
              center={[r.lat, r.lng]}
              radius={isSel ? 12 : 8}
              pathOptions={{
                color: isSel ? '#0ea5e9' : '#ffffff',
                weight: isSel ? 3 : 1.5,
                fillColor: markerColor(r),
                fillOpacity: 0.9,
              }}
              eventHandlers={{ click: () => onSelect(r.id) }}
            >
              <Popup autoPan={false}>
                <ListingPopup r={r} />
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      <div className="legend">
        <span><i className="dot green" /> Atteint l'objectif</span>
        <span><i className="dot amber" /> Dans le budget, plus lent</span>
        <span><i className="dot sel" /> Sélectionné</span>
      </div>
    </div>
  )
}

// Swipeable image carousel: arrows, click/tap-to-advance, swipe, and a counter.
function PhotoCarousel({ photos, title }) {
  const [i, setI] = useState(0)
  const [touch, setTouch] = useState(null)
  if (!photos || !photos.length) return null
  const n = photos.length
  const step = (d) => setI((prev) => (prev + d + n) % n)

  const onStart = (e) => setTouch(e.changedTouches[0].clientX)
  const onEnd = (e) => {
    if (touch == null) return
    const dx = e.changedTouches[0].clientX - touch
    if (Math.abs(dx) > 30) step(dx < 0 ? 1 : -1)
    setTouch(null)
  }

  return (
    <div className="carousel" onTouchStart={onStart} onTouchEnd={onEnd}>
      <img
        src={photos[i]}
        alt={`${title} — photo ${i + 1}`}
        loading="lazy"
        onClick={() => step(1)}
        title="Cliquez pour la photo suivante"
      />
      {n > 1 && (
        <>
          <button
            className="car-nav prev"
            onClick={(e) => { e.stopPropagation(); step(-1) }}
            aria-label="Photo précédente"
          >
            ‹
          </button>
          <button
            className="car-nav next"
            onClick={(e) => { e.stopPropagation(); step(1) }}
            aria-label="Photo suivante"
          >
            ›
          </button>
          <span className="car-count">{i + 1}/{n}</span>
        </>
      )}
    </div>
  )
}

function ListingPopup({ r }) {
  const a = r.analysis
  const m = r.market
  return (
    <div className="popup">
      <PhotoCarousel photos={r.photos} title={r.title} />
      <h3>{r.title}</h3>
      <div className="popup-addr">{r.address}</div>
      <table className="popup-table">
        <tbody>
          <tr><td>Type</td><td>{typeFr(r.propertyType)}</td></tr>
          <tr><td>Prix</td><td>{fmtEur(r.price)}</td></tr>
          <tr><td>Surface</td><td>{r.sizeM2} m² · {r.bedrooms} ch.</td></tr>
          <tr><td>État</td><td>{conditionFr(r.condition)}{r.seaView ? ' · vue mer' : ''}</td></tr>
          <tr className="sep"><td>Tarif/nuit suggéré</td><td><strong>{fmtEur(a.nightly)}</strong> (haute s. {fmtEur(a.peakNightly)})</td></tr>
          <tr><td>Revenu net annuel</td><td>{fmtEur(a.netAnnual)}</td></tr>
          <tr><td>Rendement net</td><td>{(a.netYield * 100).toFixed(1)} %</td></tr>
          <tr><td>Amortissement</td><td><strong>{isFinite(a.paybackYears) ? a.paybackYears.toFixed(1) + ' ans' : '—'}</strong></td></tr>
        </tbody>
      </table>

      <div className={'popup-verdict v-' + m.verdict}>
        {m.avgNightly != null ? (
          <>
            Le loyer est <strong>{verdictFr(m.verdict)}</strong> la moyenne de {fmtEur(m.avgNightly)}/nuit
            {' '}({(m.deltaPct * 100).toFixed(0)} %, {m.peerCount} biens {r.bedrooms} ch. similaires à {r.city})
          </>
        ) : (
          <>Aucun appartement {r.bedrooms} ch. comparable à {r.city} pour référence.</>
        )}
      </div>

      <details className="popup-seasons">
        <summary>Détail saisonnier</summary>
        <table className="popup-table">
          <thead>
            <tr><th>Saison</th><th>€/nuit</th><th>Nuits</th><th>Revenu</th></tr>
          </thead>
          <tbody>
            {a.seasonBreakdown.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td>{fmtEur(s.seasonRate)}</td>
                <td>{s.bookedNights}</td>
                <td>{fmtEur(s.income)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {r.url && (
        <a className="popup-link" href={r.url} target="_blank" rel="noreferrer">
          Voir l'annonce d'origine{r.source ? ` (${r.source})` : ''} ↗
        </a>
      )}
    </div>
  )
}
