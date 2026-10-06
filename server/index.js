// Key-holding API: proxies Groq (so the key never ships to the browser) and
// exposes the deterministic engine server-side. Mirrors the Vite dev proxy so
// paths are identical in local dev and production.

import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { EVENT_TYPES } from '../src/constants/presets.js'
import { sanitizeEvents } from '../src/lib/sanitize.js'
import { createLogger } from './logger.js'
import { createRateLimiter } from './rateLimit.js'
import { createStore } from './store.js'
import { classifySession } from './engine.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_DATA_DIR = fileURLToPath(new URL('./data/', import.meta.url))

// Comma-separated allowlist. '*' opts into permissive CORS (dev only); unset
// defaults to permissive in dev and same-origin-only in production.
function corsOrigin() {
  const raw = (process.env.CORS_ORIGIN || '').trim()
  if (raw === '*') return '*'
  if (raw) {
    const allow = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return (origin, cb) => {
      if (!origin || allow.includes(origin)) return cb(null, true)
      return cb(new Error('Not allowed by CORS'))
    }
  }
  return process.env.NODE_ENV === 'production' ? false : '*'
}

function validateEvents(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.events)) {
    return { error: '`events` must be an array.' }
  }
  if (body.events.length > 200) return { error: 'Too many events (max 200).' }
  for (const e of body.events) {
    if (!e || typeof e.type !== 'string' || !EVENT_TYPES.includes(e.type)) {
      return { error: `Unknown event type: ${e?.type}` }
    }
    if (typeof e.detail !== 'string') return { error: 'Each event needs a string `detail`.' }
  }
  return { events: sanitizeEvents(body.events), isReturning: Boolean(body.isReturning) }
}

export function createApp({ logger = createLogger(), store, limiter, fetchImpl } = {}) {
  const app = express()
  app.set('trust proxy', true)
  app.disable('x-powered-by')

  const doFetch = fetchImpl || globalThis.fetch
  const db = store || createStore({ dir: process.env.DATA_DIR || DEFAULT_DATA_DIR, logger })
  const rateLimit =
    limiter ||
    createRateLimiter({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
      max: Number(process.env.RATE_LIMIT_MAX) || 120,
    })

  const metrics = { requests: 0, errors: 0, latencyMsSum: 0, byRoute: {} }

  app.use(express.json({ limit: '100kb' }))
  app.use(cors({ origin: corsOrigin() }))
  app.use((req, res, next) => {
    req.id = req.get('x-request-id') || randomUUID()
    res.set('x-request-id', req.id)
    const started = Date.now()
    res.on('finish', () => {
      const ms = Date.now() - started
      metrics.requests += 1
      metrics.latencyMsSum += ms
      if (res.statusCode >= 500) metrics.errors += 1
      const route = req.route?.path || req.path
      metrics.byRoute[route] = (metrics.byRoute[route] || 0) + 1
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
      logger[level]('request', {
        id: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms,
      })
    })
    next()
  })

  app.get('/', (_req, res) => res.json({ ok: true, service: 'shopper-intent-api' }))

  app.get('/health', (_req, res) =>
    res.json({
      ok: true,
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
    }),
  )

  app.get('/metrics', (_req, res) =>
    res.json({
      requests: metrics.requests,
      errors: metrics.errors,
      avgLatencyMs: metrics.requests ? Math.round(metrics.latencyMsSum / metrics.requests) : 0,
      byRoute: metrics.byRoute,
      store: db.aggregate(),
    }),
  )

  // Deterministic engine, server-side.
  app.post('/api/classify', rateLimit, (req, res) => {
    const parsed = validateEvents(req.body)
    if (parsed.error) return res.status(400).json({ error: { message: parsed.error } })

    const result = classifySession(parsed.events, parsed.isReturning)
    const record = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      isReturning: parsed.isReturning,
      eventCount: parsed.events.length,
      classification: result.classification,
      confidence: result.confidence,
    }
    db.record(record)
    return res.json({ ...result, meta: { recordId: record.id, requestId: req.id } })
  })

  // Groq proxy: attaches the key server-side and passes status/body through.
  app.post('/api/groq/openai/v1/chat/completions', rateLimit, async (req, res) => {
    const key = process.env.GROQ_API_KEY
    if (!key) {
      return res.status(500).json({ error: { message: 'GROQ_API_KEY is not set on the server.' } })
    }
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      Number(process.env.GROQ_TIMEOUT_MS) || 20_000,
    )
    try {
      const upstream = await doFetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(req.body),
        signal: controller.signal,
      })
      const text = await upstream.text()
      return res.status(upstream.status).type('application/json').send(text)
    } catch (e) {
      const message = controller.signal.aborted
        ? 'Upstream timed out.'
        : `Upstream error: ${e.message}`
      return res.status(controller.signal.aborted ? 504 : 502).json({ error: { message } })
    } finally {
      clearTimeout(timer)
    }
  })

  app.use((_req, res) => res.status(404).json({ error: { message: 'Not found' } }))

  app.use((err, _req, res, _next) => {
    logger.error('unhandled error', { error: err.message })
    res.status(500).json({ error: { message: 'Internal server error' } })
  })

  return app
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const logger = createLogger()
  const port = process.env.PORT || 8080
  createApp({ logger }).listen(port, () => logger.info('shopper-intent-api listening', { port }))
}
