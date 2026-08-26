import { STATES } from '../constants/presets.js'
import { StateBadge, ConfidenceBar, Panel, AgreementPill } from './ui/index.jsx'

// Right panel: final decision + rule/LLM verdicts, evidence, and the nudge.
export default function DecisionPanel({
  decision,
  ruleResult,
  llmResult,
  llmLoading,
  llmError,
  llmLatency,
  onRunLLM,
  action,
  hasEvents,
}) {
  const barClass = STATES[decision?.classification]?.barClass

  return (
    <Panel title="Decision" subtitle="Hybrid rule engine + LLM" className="w-full lg:w-96 lg:shrink-0">
      <div className="flex flex-col gap-5 p-4">
        {!hasEvents ? (
          <div className="flex min-h-48 items-center justify-center text-center text-sm text-slate-500">
            Add events or load a preset — the rule engine classifies instantly.
          </div>
        ) : (
          <>
            {/* Final call */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <StateBadge state={decision.classification} size="lg" />
                <AgreementPill agreement={decision.agreement} />
              </div>
              <ConfidenceBar confidence={decision.confidence} barClass={barClass} />
              <p className="text-xs text-slate-500">
                Source: <span className="text-slate-300">{decision.source}</span>
              </p>
            </div>

            {/* Two verdicts side by side */}
            <div className="grid grid-cols-2 gap-3">
              <VerdictBox title="Rule engine">
                <StateBadge state={ruleResult.classification} />
                <span className="font-mono text-xs text-slate-400">{ruleResult.confidence}%</span>
              </VerdictBox>
              <VerdictBox title="LLM (Groq)">
                {llmLoading ? (
                  <span className="text-xs text-slate-400">classifying…</span>
                ) : llmResult ? (
                  <>
                    <StateBadge state={llmResult.classification} />
                    <span className="font-mono text-xs text-slate-400">{llmResult.confidence}%</span>
                    {llmLatency != null && (
                      <span className="font-mono text-[10px] text-slate-500">· {llmLatency}ms</span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-slate-500">not run</span>
                )}
              </VerdictBox>
            </div>

            <button
              onClick={onRunLLM}
              disabled={llmLoading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {llmLoading ? 'Asking the LLM…' : llmResult ? 'Re-run LLM second opinion' : 'Get LLM second opinion'}
            </button>

            {llmError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
                <p className="text-xs font-medium text-red-200">LLM call failed</p>
                <p className="mt-1 text-xs leading-relaxed text-red-300/80">{llmError}</p>
              </div>
            )}

            {/* Evidence: what the rules actually fired on */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Evidence (rules fired)
              </h3>
              {ruleResult.firedRules.length === 0 ? (
                <p className="text-sm text-slate-500">No rules matched — defaulted to Browser.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {ruleResult.firedRules.map((r) => (
                    <li key={r.id} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${STATES[r.state].dotClass}`} />
                      <span>
                        {r.explanation}
                        <span className="ml-1 font-mono text-[10px] text-slate-600">+{r.weight}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* LLM evidence + reasoning, only when we have it */}
            {llmResult && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  LLM evidence
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {llmResult.evidence.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {llmResult.reasoning && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{llmResult.reasoning}</p>
                )}
              </div>
            )}

            {/* Recommended nudge */}
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-300/80">
                Recommended action
              </h3>
              <p className="mt-1 text-sm text-indigo-100">{action}</p>
              {llmResult && llmResult.recommended_action && (
                <p className="mt-2 border-t border-indigo-500/20 pt-2 text-xs text-indigo-200/80">
                  <span className="font-semibold">LLM suggests:</span> {llmResult.recommended_action}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

function VerdictBox({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">{title}</p>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

