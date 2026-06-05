import React from 'react'
import { fmtEur } from '../lib/rental.js'
import { conditionFr, verdictShortFr, SORT_OPTIONS } from '../lib/i18n.js'

export default function Sidebar({
  budget,
  setBudget,
  targetPaybackYears,
  setTargetPaybackYears,
  query,
  setQuery,
  cities,
  cityFilter,
  setCityFilter,
  minBedrooms,
  setMinBedrooms,
  seaOnly,
  setSeaOnly,
  sortBy,
  setSortBy,
  results,
  matching,
  totalCount,
  selectedId,
  onSelect,
  usingReal,
}) {
  return (
    <aside className="sidebar">
      <header className="brand">
        <h1>Rentabilité Dalmatie</h1>
        <p>Trouvez des appartements qui se remboursent — modèle de location saisonnière touristique.</p>
      </header>

      <div className="controls">
        <label className="field">
          <span className="field-label">
            Budget (prix d'achat max)
            <strong>{fmtEur(budget)}</strong>
          </span>
          <input
            type="range"
            min="60000"
            max="900000"
            step="10000"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
          <input
            type="number"
            className="num"
            min="0"
            step="5000"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value) || 0)}
          />
        </label>

        <label className="field">
          <span className="field-label">
            Délai de rentabilité visé
            <strong>{targetPaybackYears} ans</strong>
          </span>
          <input
            type="range"
            min="3"
            max="30"
            step="1"
            value={targetPaybackYears}
            onChange={(e) => setTargetPaybackYears(Number(e.target.value))}
          />
        </label>
      </div>

      {/* Search + filters + sort */}
      <div className="filters">
        <input
          type="search"
          className="search"
          placeholder="Rechercher (ville, titre, adresse)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filter-row">
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
            <option value="all">Toutes les villes</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={minBedrooms} onChange={(e) => setMinBedrooms(Number(e.target.value))}>
            <option value="0">Chambres : toutes</option>
            <option value="1">1+ chambre</option>
            <option value="2">2+ chambres</option>
            <option value="3">3+ chambres</option>
            <option value="4">4+ chambres</option>
          </select>
        </div>
        <div className="filter-row">
          <select className="grow" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>Trier : {o.label}</option>
            ))}
          </select>
          <label className="checkbox">
            <input type="checkbox" checked={seaOnly} onChange={(e) => setSeaOnly(e.target.checked)} />
            Vue mer
          </label>
        </div>
      </div>

      <div className="summary">
        <div className="stat">
          <span className="stat-num">{results.length}</span>
          <span className="stat-lbl">affichés{totalCount ? ` / ${totalCount}` : ''}</span>
        </div>
        <div className="stat good">
          <span className="stat-num">{matching.length}</span>
          <span className="stat-lbl">atteignent l'objectif</span>
        </div>
      </div>

      <div className="list">
        {results.length === 0 && (
          <p className="empty">Aucun appartement ne correspond. Élargissez vos critères ou augmentez le budget.</p>
        )}
        {results.map((r) => (
          <button
            key={r.id}
            className={
              'card' +
              (r.meetsTarget ? ' card-good' : '') +
              (r.id === selectedId ? ' card-selected' : '')
            }
            onClick={() => onSelect(r.id)}
          >
            <div className="card-top">
              <span className="card-title">{r.title}</span>
              <span className="card-price">{fmtEur(r.price)}</span>
            </div>
            <div className="card-meta">
              {r.city} · {r.sizeM2} m² · {conditionFr(r.condition)}
              {r.seaView ? ' · vue mer' : ''}
            </div>
            <div className="card-stats">
              <span>
                Amortissement{' '}
                <strong>
                  {isFinite(r.analysis.paybackYears)
                    ? r.analysis.paybackYears.toFixed(1) + ' ans'
                    : '—'}
                </strong>
              </span>
              <span>
                Rendement net <strong>{(r.analysis.netYield * 100).toFixed(1)} %</strong>
              </span>
            </div>
            <div className={'card-rent rent-' + r.market.verdict}>
              Suggéré {fmtEur(r.analysis.nightly)}/nuit ·{' '}
              {r.market.avgNightly != null
                ? `${verdictShortFr(r.market.verdict)} de la moyenne (${fmtEur(r.market.avgNightly)})`
                : 'pas de comparables'}
            </div>
          </button>
        ))}
      </div>

      <footer className="disclaimer">
        {usingReal
          ? 'Annonces réelles issues de nekretnine.hr. Estimations de loyer fondées sur un modèle, ne constituent pas un conseil en investissement.'
          : 'Données de démonstration. Estimations fondées sur un modèle, ne constituent pas un conseil en investissement.'}
      </footer>
    </aside>
  )
}
