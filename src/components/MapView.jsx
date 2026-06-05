import React, { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { fmtEur } from '../lib/rental.js'
import { conditionFr, verdictFr, fmtDate } from '../lib/i18n.js'

// Dalmatia roughly centred.
const CENTER = [43.5, 16.6]
const ZOOM = 8

function FlyToSelected({ selected }) {
  const map = useMap()
  useEffect(() => {
    if (selected) map.flyTo([selected.lat, selected.lng], 12, { duration: 0.6 })
  }, [selected, map])
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
        <button className="refetch-btn" onClick={onRefetch} disabled={refetching}>
          {refetching ? '⟳ Récupération…' : '⟳ Actualiser les données'}
        </button>
        {refetchError && <div className="data-error">{refetchError}</div>}
      </div>

      <MapContainer center={CENTER} zoom={ZOOM} className="map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToSelected selected={selected} />

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
              <Popup>
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

function ListingPopup({ r }) {
  const a = r.analysis
  const m = r.market
  return (
    <div className="popup">
      <h3>{r.title}</h3>
      <div className="popup-addr">{r.address}</div>
      <table className="popup-table">
        <tbody>
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
          Voir l'annonce d'origine ↗
        </a>
      )}
    </div>
  )
}
