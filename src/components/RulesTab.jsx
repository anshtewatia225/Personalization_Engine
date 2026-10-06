import { RULES } from '../lib/rules.js'
import { STATES, STATE_KEYS } from '../constants/presets.js'
import { StateBadge } from './ui/index.jsx'

// Lists every rule (fired/toggleable) and the live vote tally per state.
export default function RulesTab({ ruleResult, disabledIds, onToggleRule }) {
  const disabled = new Set(disabledIds)
  const fired = new Set(ruleResult.firedRules.map((r) => r.id))
  const maxScore = Math.max(1, ...STATE_KEYS.map((s) => ruleResult.scores[s]))

  return (
    <div className="flex flex-col gap-4">
      {/* Vote tally */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Vote tally (this session)
        </h3>
        <div className="flex flex-col gap-1.5">
          {STATE_KEYS.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-28 shrink-0">
                <StateBadge state={s} />
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700/60">
                <div
                  className={`h-full rounded-full ${STATES[s].barClass}`}
                  style={{ width: `${(ruleResult.scores[s] / maxScore) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-xs text-slate-400">
                {ruleResult.scores[s]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Rule list */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Rules ({RULES.length}) · toggle to see impact
        </h3>
        <div className="flex flex-col gap-2">
          {RULES.map((rule) => {
            const isOn = !disabled.has(rule.id)
            const didFire = fired.has(rule.id)
            return (
              <div
                key={rule.id}
                className={`flex items-start gap-3 rounded-lg border p-3 transition ${
                  didFire
                    ? 'border-indigo-500/40 bg-indigo-500/5'
                    : 'border-slate-700 bg-slate-900/40'
                } ${isOn ? '' : 'opacity-50'}`}
              >
                <label className="mt-0.5 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={() => onToggleRule(rule.id)}
                    className="h-4 w-4 accent-indigo-500"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-200">{rule.label}</span>
                    <StateBadge state={rule.state} />
                    <span className="font-mono text-[10px] text-slate-500">
                      weight {rule.weight}
                    </span>
                    {didFire && (
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-200">
                        fired
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-snug text-slate-400">{rule.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
