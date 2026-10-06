import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../store.js'
import { createRateLimiter } from '../rateLimit.js'
import { classifySession } from '../engine.js'
import { createLogger } from '../logger.js'

test('store aggregates records in memory', () => {
  const store = createStore({})
  store.record({ classification: 'BROWSER' })
  store.record({ classification: 'BROWSER' })
  store.record({ classification: 'COMPARER' })
  assert.deepEqual(store.aggregate(), {
    count: 3,
    distribution: { BROWSER: 2, COMPARER: 1 },
  })
})

test('rate limiter allows up to max then blocks within the window', () => {
  let clock = 0
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => clock })
  const headers = {}
  const res = {
    set: (k, v) => {
      headers[k] = v
    },
    status(code) {
      this.code = code
      return this
    },
    json() {
      return this
    },
  }
  const req = { ip: '1.2.3.4' }
  let blocked = 0
  const next = () => {}
  limiter(req, res, next)
  limiter(req, res, next)
  limiter(req, res, next)
  blocked = res.code === 429 ? 1 : 0
  assert.equal(blocked, 1)
  assert.equal(headers['X-RateLimit-Remaining'], '0')

  clock = 2000 // window elapsed
  res.code = undefined
  limiter(req, res, next)
  assert.equal(res.code, undefined)
})

test('server-side engine mirrors the client rules', () => {
  const result = classifySession(
    [
      { type: 'ADD_TO_CART', detail: 'Aurora Desk' },
      { type: 'CHECKOUT_START', detail: 'shipping' },
      { type: 'CHECKOUT_ABANDON', detail: 'left' },
    ],
    false,
  )
  assert.equal(result.classification, 'CART_ABANDONER')
  assert.ok(result.firedRules.length > 0)
  assert.equal(result.signals.abandonedCheckout, true)
})

test('logger writes JSON lines', () => {
  const writes = []
  const original = process.stdout.write
  process.stdout.write = (chunk) => {
    writes.push(chunk)
    return true
  }
  try {
    createLogger().info('hello', { a: 1 })
  } finally {
    process.stdout.write = original
  }
  const parsed = JSON.parse(writes[0])
  assert.equal(parsed.msg, 'hello')
  assert.equal(parsed.level, 'info')
  assert.equal(parsed.a, 1)
})
