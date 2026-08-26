import { useMemo, useState } from 'react'
import { EVAL_SESSIONS } from '../constants/presets.js'
import { extractFeatures } from '../lib/features.js'
import { runRules } from '../lib/rules.js'
import { callLLMClassifier } from '../lib/classify.js'
import { StateBadge } from './ui/index.jsx'

// Batch eval vs the labeled corpus: rules scored instantly, LLM on demand.
// Uses the full rule set regardless of UI toggles.
export default function EvalTab() {
  const [llmPreds, setLlmPreds] = useState({}) // id -> { classification } | { error }
  const [running, setRunning] = useState(false)

  const rulePreds = useMemo(
    () =>
      EVAL_SESSIONS.map((s) => ({
        session: s,
        predicted: runRules(extractFeatures(s.events, s.isReturning)).classification,
      })),
    [],
  )

  const ruleCorrect = rulePreds.filter((r) => r.predicted === r.session.expectedState).length
  const ruleAccuracy = Math.round((ruleCorrect / EVAL_SESSIONS.length) * 100)

  const llmScored = EVAL_SESSIONS.filter((s) => llmPreds[s.id]?.classification)
  const llmCorrect = llmScored.filter((s) => llmPreds[s.id].classification === s.expectedState).length
  const llmAccuracy = llmScored.length ? Math.round((llmCorrect / llmScored.length) * 100) : null

  async function runLLMEval() {
    setRunning(true)
    setLlmPreds({})
    for (const s of EVAL_SESSIONS) {
      try {
        const res = await callLLMClassifier({ events: s.events, isReturning: s.isReturning })
        setLlmPreds((prev) => ({ ...prev, [s.id]: { classification: res.classification } }))
      } catch (e) {
        setLlmPreds((prev) => ({ ...prev, [s.id]: { error: e.message } }))
      }
    }
    setRunning(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3">
          <Metric label="Rule engine accuracy" value={`${ruleAccuracy}%`} sub={`${ruleCorrect}/${EVAL_SESSIONS.length}`} />
          <Metric
            label="LLM accuracy"
            value={llmAccuracy === null ? '—' : `${llmAccuracy}%`}
            sub={llmScored.length ? `${llmCorrect}/${llmScored.length}` : 'not run'}
          />
        </div>
        <button
          onClick={runLLMEval}
          disabled={running}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? 'Running LLM eval…' : 'Run LLM evaluation'}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Session</th>
              <th className="px-3 py-2 font-medium">Expected</th>
              <th className="px-3 py-2 font-medium">Rules</th>
              <th className="px-3 py-2 font-medium">LLM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rulePreds.map(({ session, predicted }) => {
              const ruleHit = predicted === session.expectedState
              const llm = llmPreds[session.id]
              return (
                <tr key={session.id} className="text-slate-300">
                  <td className="px-3 py-2 font-medium text-slate-200">{session.name}</td>
                  <td className="px-3 py-2">
                    <StateBadge state={session.expectedState} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <StateBadge state={predicted} />
                      <Mark ok={ruleHit} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {!llm ? (
                      <span className="text-xs text-slate-600">—</span>
                    ) : llm.error ? (
                      <span className="text-xs text-red-400" title={llm.error}>
                        error
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <StateBadge state={llm.classification} />
                        <Mark ok={llm.classification === session.expectedState} />
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        The <span className="text-slate-300">Torn Shopper</span> row is the deliberately ambiguous
        case — expect the two approaches to diverge there.
      </p>
    </div>
  )
}

function Metric({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-mono text-xl text-slate-100">
        {value} <span className="text-xs text-slate-500">{sub}</span>
      </p>
    </div>
  )
}

function Mark({ ok }) {
  return ok ? (
    <span className="text-emerald-400" title="correct">
      ✓
    </span>
  ) : (
    <span className="text-red-400" title="incorrect">
      ✗
    </span>
  )
}
