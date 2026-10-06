// Small presentational primitives shared across panels and tabs.

import { STATES } from '../../constants/presets.js'

export function StateBadge({ state, size = 'sm' }) {
  const meta = STATES[state]
  if (!meta) return null
  const pad = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${pad} ${meta.badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  )
}

export function EventTypePill({ type }) {
  return (
    <span className="rounded bg-slate-700/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-300">
      {type}
    </span>
  )
}

export function ConfidenceBar({ confidence, barClass = 'bg-indigo-500', label = 'Confidence' }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">{Math.round(confidence)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700/70">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: `${Math.max(0, Math.min(100, confidence))}%` }}
        />
      </div>
    </div>
  )
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {Object.entries(STATES).map(([key, meta]) => (
        <span key={key} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
          {meta.label}
        </span>
      ))}
    </div>
  )
}

// A titled card surface — the repeated container used by every panel.
export function Panel({ title, subtitle, right, children, className = '' }) {
  return (
    <section
      className={`flex flex-col rounded-xl border border-slate-700 bg-slate-800/60 ${className}`}
    >
      {(title || right) && (
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <div>
            {title && <h2 className="font-medium text-slate-100">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function AgreementPill({ agreement }) {
  if (agreement === null || agreement === undefined) return null
  return agreement ? (
    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/30">
      rules &amp; LLM agree
    </span>
  ) : (
    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-400/30">
      disagreement
    </span>
  )
}
