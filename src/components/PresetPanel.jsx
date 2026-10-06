import { PRESETS } from '../constants/presets.js'
import { StateBadge } from './ui/index.jsx'

// Left rail: loadable labeled sessions.
export default function PresetPanel({ activeId, onLoad }) {
  return (
    <aside className="flex w-full flex-col gap-3 lg:w-64 lg:shrink-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Preset sessions
      </h2>
      <div className="flex flex-col gap-2">
        {PRESETS.map((preset) => {
          const active = preset.id === activeId
          return (
            <button
              key={preset.id}
              onClick={() => onLoad(preset)}
              className={`rounded-xl border p-3 text-left transition ${
                active
                  ? 'border-indigo-500/60 bg-indigo-500/10'
                  : 'border-slate-700 bg-slate-800/60 hover:border-slate-600 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-100">{preset.name}</span>
                <span className="text-[10px] text-slate-500">{preset.events.length} ev</span>
              </div>
              <p className="mt-1 text-xs leading-snug text-slate-400">{preset.description}</p>
              <div className="mt-2">
                <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-600">
                  label
                </span>
                <StateBadge state={preset.expectedState} />
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
