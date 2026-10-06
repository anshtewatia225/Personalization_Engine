import { EVENT_TYPES } from '../constants/presets.js'
import { EventTypePill, Panel } from './ui/index.jsx'

// Middle panel: the live event stream. Edits re-classify instantly.
export default function EventStreamPanel({
  events,
  isReturning,
  onToggleReturning,
  onDeleteEvent,
  onAddEvent,
  newType,
  setNewType,
  newDetail,
  setNewDetail,
}) {
  function handleAdd(e) {
    e.preventDefault()
    if (!newDetail.trim()) return
    onAddEvent({ type: newType, detail: newDetail.trim() })
    setNewDetail('')
  }

  const returnToggle = (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
      <input
        type="checkbox"
        checked={isReturning}
        onChange={(e) => onToggleReturning(e.target.checked)}
        className="h-3.5 w-3.5 accent-indigo-500"
      />
      Return visitor
    </label>
  )

  return (
    <Panel
      title="Event stream"
      subtitle={`${events.length} events · classifies live as you edit`}
      right={returnToggle}
      className="min-h-0 flex-1"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {events.length === 0 ? (
          <div className="flex h-full min-h-32 items-center justify-center text-center text-sm text-slate-500">
            No events yet. Load a preset or add events below.
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {events.map((ev, i) => (
              <li
                key={i}
                className="group flex items-start gap-3 rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-2"
              >
                <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-slate-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <EventTypePill type={ev.type} />
                  <p className="mt-1 break-words text-sm text-slate-200">{ev.detail}</p>
                </div>
                <button
                  onClick={() => onDeleteEvent(i)}
                  title="Remove event"
                  className="shrink-0 rounded p-1 text-slate-600 opacity-0 transition hover:bg-slate-700 hover:text-red-300 group-hover:opacity-100"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={handleAdd} className="border-t border-slate-700 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none sm:w-44"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            value={newDetail}
            onChange={(e) => setNewDetail(e.target.value)}
            placeholder="Event detail, e.g. tried code SAVE20"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-600 bg-slate-700/60 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
          >
            Add event
          </button>
        </div>
      </form>
    </Panel>
  )
}
