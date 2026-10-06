// Neutralizes untrusted event text before it is embedded in an LLM prompt.
// Event details are user-controlled in a real system, so they are treated as
// hostile input: control characters stripped, code fences neutralized, length
// capped, and the event type validated against the known enum.

import { EVENT_TYPES } from '../constants/presets.js'

const MAX_DETAIL_LENGTH = 280
const CODE_FENCE = /```/g
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

export function sanitizeDetail(detail) {
  if (typeof detail !== 'string') return ''
  return detail
    .replace(CONTROL_CHARS, ' ')
    .replace(CODE_FENCE, "'''")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DETAIL_LENGTH)
}

export function sanitizeEvent(event) {
  const type = EVENT_TYPES.includes(event?.type) ? event.type : 'PAGE_VIEW'
  return { type, detail: sanitizeDetail(event?.detail) }
}

export function sanitizeEvents(events) {
  if (!Array.isArray(events)) return []
  return events.map(sanitizeEvent)
}

export { MAX_DETAIL_LENGTH }
