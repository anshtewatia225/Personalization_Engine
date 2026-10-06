import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../index.js'
import { createStore } from '../store.js'
import { createRateLimiter } from '../rateLimit.js'

const silent = {
  info() {},
  warn() {},
  error() {},
  child() {
    return silent
  },
}

async function withServer(app, fn) {
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    return await fn(base)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const post = (base, path, body) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const DISCOUNT_EVENTS = [
  { type: 'SEARCH', detail: 'searched "shoes discount"' },
  { type: 'COUPON_ATTEMPT', detail: 'tried code SAVE20 — rejected' },
  { type: 'COUPON_ATTEMPT', detail: 'tried code WELCOME10 — rejected' },
]

test('GET /health reports ok', async () => {
  const app = createApp({ logger: silent, store: createStore({}), fetchImpl: async () => {} })
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/health`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
  })
})

test('POST /api/classify returns a deterministic decision and records it', async () => {
  const store = createStore({})
  const app = createApp({ logger: silent, store, fetchImpl: async () => {} })
  await withServer(app, async (base) => {
    const res = await post(base, '/api/classify', { events: DISCOUNT_EVENTS, isReturning: false })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.classification, 'DISCOUNT_SEEKER')
    assert.ok(body.meta.recordId)
    assert.equal(store.aggregate().count, 1)
    assert.equal(store.aggregate().distribution.DISCOUNT_SEEKER, 1)
  })
})

test('POST /api/classify rejects malformed input', async () => {
  const app = createApp({ logger: silent, store: createStore({}), fetchImpl: async () => {} })
  await withServer(app, async (base) => {
    const missing = await post(base, '/api/classify', {})
    assert.equal(missing.status, 400)
    const badType = await post(base, '/api/classify', {
      events: [{ type: 'DROP_TABLE', detail: 'x' }],
    })
    assert.equal(badType.status, 400)
  })
})

test('rate limiter returns 429 after the limit', async () => {
  const app = createApp({
    logger: silent,
    store: createStore({}),
    limiter: createRateLimiter({ max: 2, windowMs: 60_000 }),
    fetchImpl: async () => {},
  })
  await withServer(app, async (base) => {
    assert.equal((await post(base, '/api/classify', { events: [] })).status, 200)
    assert.equal((await post(base, '/api/classify', { events: [] })).status, 200)
    const limited = await post(base, '/api/classify', { events: [] })
    assert.equal(limited.status, 429)
    assert.equal(limited.headers.get('x-ratelimit-remaining'), '0')
  })
})

test('groq proxy reports a missing key', async () => {
  const previous = process.env.GROQ_API_KEY
  delete process.env.GROQ_API_KEY
  try {
    const app = createApp({ logger: silent, store: createStore({}), fetchImpl: async () => {} })
    await withServer(app, async (base) => {
      const res = await post(base, '/api/groq/openai/v1/chat/completions', {})
      assert.equal(res.status, 500)
    })
  } finally {
    if (previous !== undefined) process.env.GROQ_API_KEY = previous
  }
})

test('groq proxy forwards upstream status and body', async () => {
  const previous = process.env.GROQ_API_KEY
  process.env.GROQ_API_KEY = 'test-key'
  const fetchImpl = async (url, opts) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions')
    assert.equal(opts.headers.Authorization, 'Bearer test-key')
    return { status: 200, text: async () => '{"ok":true}' }
  }
  try {
    const app = createApp({ logger: silent, store: createStore({}), fetchImpl })
    await withServer(app, async (base) => {
      const res = await post(base, '/api/groq/openai/v1/chat/completions', { model: 'x' })
      assert.equal(res.status, 200)
      assert.deepEqual(await res.json(), { ok: true })
    })
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = previous
  }
})

test('every response carries a request id and metrics accrue', async () => {
  const app = createApp({ logger: silent, store: createStore({}), fetchImpl: async () => {} })
  await withServer(app, async (base) => {
    const res = await post(base, '/api/classify', { events: [] })
    assert.ok(res.headers.get('x-request-id'))
    const metrics = await (await fetch(`${base}/metrics`)).json()
    assert.ok(metrics.requests >= 1)
    assert.ok(metrics.byRoute['/api/classify'] >= 1)
  })
})
