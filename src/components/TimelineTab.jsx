import { STATES } from '../constants/presets.js'
import { EventTypePill, StateBadge } from './ui/index.jsx'

// Rule-engine classification at each step of the session.
export default function TimelineTab({ steps }) {
  if (steps.length === 0) {
    return <p className="text-sm text-slate-500">No events yet — nothing to trace.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Compact state track */}
      <div className="flex flex-wrap items-center gap-1">
        {steps.map((step, i) => {
          const changed = i === 0 || step.classification !== steps[i - 1].classification
          return (
            <div key={step.index} className="flex items-center gap-1" title={`Step ${step.index}: ${step.classification}`}>
              <span
                className={`h-3 w-3 rounded-full ${STATES[step.classification].dotClass} ${
                  changed ? 'ring-2 ring-white/30' : ''
                }`}
              />
              {i < steps.length - 1 && <span className="h-px w-3 bg-slate-600" />}
            </div>
          )
        })}
      </div>

      {/* Step-by-step list */}
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => {
          const changed = i === 0 || step.classification !== steps[i - 1].classification
          return (
            <li
              key={step.index}
              className="flex items-center gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-2"
            >
              <span className="w-5 shrink-0 text-right font-mono text-xs text-slate-600">{step.index}</span>
              <div className="min-w-0 flex-1">
                <EventTypePill type={step.event.type} />
                <p className="mt-0.5 truncate text-sm text-slate-300">{step.event.detail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {changed && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-indigo-300">
                    → shift
                  </span>
                )}
                <StateBadge state={step.classification} />
                <span className="w-8 text-right font-mono text-xs text-slate-500">{step.confidence}%</span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
