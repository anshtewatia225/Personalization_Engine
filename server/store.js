// File-based persistence (JSON Lines). Deliberately dependency-free: enough to
// close the feedback loop and show aggregate stats. At real scale this becomes
// Postgres/SQLite with a proper schema and migrations.

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function createStore({ dir, logger } = {}) {
  const file = dir ? join(dir, 'classifications.jsonl') : null
  if (file) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch (e) {
      logger?.warn('store directory unavailable; running in memory', { error: e.message })
    }
  }

  let count = 0
  const distribution = {}

  return {
    record(entry) {
      count += 1
      distribution[entry.classification] = (distribution[entry.classification] || 0) + 1
      if (!file) return
      try {
        appendFileSync(file, `${JSON.stringify(entry)}\n`)
      } catch (e) {
        logger?.warn('store write failed', { error: e.message })
      }
    },

    aggregate() {
      return { count, distribution: { ...distribution } }
    },

    readAll() {
      if (!file || !existsSync(file)) return []
      return readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(Boolean)
    },
  }
}
