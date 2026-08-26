import { useMemo, useState } from 'react'
import { EVENT_TYPES, PRESETS } from './constants/presets.js'
import { GROQ_MODEL, callLLMClassifier } from './lib/classify.js'
import { extractFeatures } from './lib/features.js'
import { runRules } from './lib/rules.js'
import { decide, classifyTimeline } from './lib/engine.js'
import { recommendedAction } from './lib/actions.js'

import { Legend } from './components/ui/index.jsx'
import PresetPanel from './components/PresetPanel.jsx'
import EventStreamPanel from './components/EventStreamPanel.jsx'
import DecisionPanel from './components/DecisionPanel.jsx'
import SignalsTab from './components/SignalsTab.jsx'
import RulesTab from './components/RulesTab.jsx'
import TimelineTab from './components/TimelineTab.jsx'
import EvalTab from './components/EvalTab.jsx'

const TABS = [
  { id: 'signals', label: 'Signals' },
  { id: 'rules', label: 'Rules' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'eval', label: 'Evaluation' },
]

export default function App() {
  const [activePresetId, setActivePresetId] = useState(PRESETS[0].id)
  const [events, setEvents] = useState(PRESETS[0].events)
  const [isReturning, setIsReturning] = useState(PRESETS[0].isReturning)
  const [disabledRuleIds, setDisabledRuleIds] = useState([])

  const [llmResult, setLlmResult] = useState(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmError, setLlmError] = useState(null)
  const [llmLatency, setLlmLatency] = useState(null)

  const [newType, setNewType] = useState(EVENT_TYPES[0])
  const [newDetail, setNewDetail] = useState('')

  const [activeTab, setActiveTab] = useState('signals')

  // Deterministic — recomputes on every edit.
  const features = useMemo(() => extractFeatures(events, isReturning), [events, isReturning])
  const ruleResult = useMemo(() => runRules(features, disabledRuleIds), [features, disabledRuleIds])
  const timeline = useMemo(
    () => classifyTimeline(events, isReturning, disabledRuleIds),
    [events, isReturning, disabledRuleIds],
  )
  const decision = useMemo(() => decide(ruleResult, llmResult), [ruleResult, llmResult])
  const action = useMemo(
    () => recommendedAction(decision.classification, events, features),
    [decision.classification, events, features],
  )

  // Any edit to the stream invalidates a prior LLM opinion.
  function clearLLM() {
    setLlmResult(null)
    setLlmError(null)
    setLlmLatency(null)
  }

  function loadPreset(preset) {
    setActivePresetId(preset.id)
    setEvents(preset.events)
    setIsReturning(preset.isReturning)
    clearLLM()
  }

  function addEvent(ev) {
    setEvents((prev) => [...prev, ev])
    setActivePresetId(null)
    clearLLM()
  }

  function deleteEvent(index) {
    setEvents((prev) => prev.filter((_, i) => i !== index))
    setActivePresetId(null)
    clearLLM()
  }

  function toggleReturning(value) {
    setIsReturning(value)
    setActivePresetId(null)
    clearLLM()
  }

  function toggleRule(id) {
    setDisabledRuleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function runLLM() {
    if (events.length === 0) return
    setLlmLoading(true)
    setLlmError(null)
    const started = performance.now()
    try {
      const res = await callLLMClassifier({ events, isReturning })
      setLlmResult(res)
      setLlmLatency(Math.round(performance.now() - started))
    } catch (e) {
      setLlmError(e.message)
      setLlmResult(null)
      setLlmLatency(null)
    } finally {
      setLlmLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 px-5 py-4 backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/90 text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18M7 14l4-4 3 3 5-6" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-100">Shopper Intent Engine</h1>
              <p className="text-xs text-slate-500">
                Deterministic rules + LLM second opinion · {GROQ_MODEL}
              </p>
            </div>
          </div>
          <Legend />
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">
        {/* Top row: presets · event stream · decision */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <PresetPanel activeId={activePresetId} onLoad={loadPreset} />
          <EventStreamPanel
            events={events}
            isReturning={isReturning}
            onToggleReturning={toggleReturning}
            onDeleteEvent={deleteEvent}
            onAddEvent={addEvent}
            newType={newType}
            setNewType={setNewType}
            newDetail={newDetail}
            setNewDetail={setNewDetail}
          />
          <DecisionPanel
            decision={decision}
            ruleResult={ruleResult}
            llmResult={llmResult}
            llmLoading={llmLoading}
            llmError={llmError}
            llmLatency={llmLatency}
            onRunLLM={runLLM}
            action={action}
            hasEvents={events.length > 0}
          />
        </div>

        {/* Bottom: analysis tabs */}
        <section className="rounded-xl border border-slate-700 bg-slate-800/60">
          <div className="flex gap-1 border-b border-slate-700 px-3 pt-3">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? 'bg-slate-900/60 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeTab === 'signals' && <SignalsTab features={features} />}
            {activeTab === 'rules' && (
              <RulesTab ruleResult={ruleResult} disabledIds={disabledRuleIds} onToggleRule={toggleRule} />
            )}
            {activeTab === 'timeline' && <TimelineTab steps={timeline} />}
            {activeTab === 'eval' && <EvalTab />}
          </div>
        </section>
      </main>
    </div>
  )
}
