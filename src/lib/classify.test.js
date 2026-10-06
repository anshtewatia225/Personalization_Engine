import { describe, it, expect, vi } from 'vitest'
import {
  callLLMClassifier,
  buildPrompt,
  extractJson,
  validate,
  estimateCost,
  PROMPT_VERSION,
  GROQ_MODEL,
} from './classify.js'

const okBody = (content) => ({
  choices: [{ message: { content } }],
  usage: { prompt_tokens: 1000, completion_tokens: 500 },
})

const jsonRes = (body, status = 200) => ({
  ok: status >= 400 ? false : true,
  status,
  json: async () => body,
})

const validContent = JSON.stringify({
  classification: 'BROWSER',
  confidence: 80,
  evidence: ['a', 'b', 'c', 'd'],
  recommended_action: 'nurture',
  reasoning: 'because.',
})

describe('buildPrompt', () => {
  it('names all five states and formats events in order', () => {
    const { system, user } = buildPrompt([{ type: 'SEARCH', detail: 'shoes' }], true)
    for (const state of [
      'BROWSER',
      'COMPARER',
      'DISCOUNT_SEEKER',
      'CART_ABANDONER',
      'LOYAL_CUSTOMER',
    ]) {
      expect(system).toContain(state)
    }
    expect(user).toContain('1. [SEARCH] shoes')
    expect(user).toContain('Return visitor: true')
  })
})

describe('extractJson', () => {
  it('parses clean JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses fenced JSON', () => {
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 })
  })

  it('extracts JSON wrapped in prose', () => {
    expect(extractJson('Sure! {"a":3} hope that helps')).toEqual({ a: 3 })
  })

  it('throws on non-JSON', () => {
    expect(() => extractJson('not json at all')).toThrow(/valid JSON/)
  })
})

describe('validate', () => {
  it('rejects an unknown classification', () => {
    expect(() => validate({ classification: 'WIZARD' })).toThrow(/Unknown classification/)
  })

  it('clamps confidence and truncates evidence', () => {
    const out = validate({
      classification: 'BROWSER',
      confidence: 250,
      evidence: ['a', 'b', 'c', 'd'],
    })
    expect(out.confidence).toBe(100)
    expect(out.evidence).toHaveLength(3)
  })

  it('defaults missing optional fields', () => {
    const out = validate({ classification: 'COMPARER', confidence: 'x' })
    expect(out.confidence).toBe(0)
    expect(out.recommended_action).toBe('—')
    expect(out.reasoning).toBe('')
  })
})

describe('estimateCost', () => {
  it('prices known models and returns 0 for unknown ones', () => {
    expect(
      estimateCost(GROQ_MODEL, { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }),
    ).toBeCloseTo(0.9)
    expect(estimateCost('unknown-model', { prompt_tokens: 1_000_000 })).toBe(0)
    expect(estimateCost(GROQ_MODEL, null)).toBe(0)
  })
})

describe('callLLMClassifier', () => {
  it('returns a validated result plus call metadata', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(okBody(validContent)))
    const result = await callLLMClassifier({ events: [], isReturning: false, fetchImpl })
    expect(result.classification).toBe('BROWSER')
    expect(result.evidence).toHaveLength(3)
    expect(result.meta).toMatchObject({
      model: GROQ_MODEL,
      promptVersion: PROMPT_VERSION,
      attempts: 1,
    })
    expect(result.meta.costUsd).toBeGreaterThan(0)
    expect(result.meta.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('sanitizes events before putting them in the prompt', async () => {
    let sentBody
    const fetchImpl = vi.fn(async (_url, opts) => {
      sentBody = JSON.parse(opts.body)
      return jsonRes(okBody(validContent))
    })
    await callLLMClassifier({
      events: [{ type: 'SEARCH', detail: '```attack```' }],
      isReturning: false,
      fetchImpl,
    })
    const userMessage = sentBody.messages.find((m) => m.role === 'user').content
    expect(userMessage).not.toContain('```')
  })

  it('retries on a 5xx then succeeds', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls++
      return calls === 1
        ? jsonRes({ error: { message: 'boom' } }, 500)
        : jsonRes(okBody(validContent))
    })
    const result = await callLLMClassifier({
      events: [],
      isReturning: false,
      fetchImpl,
      retries: 2,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.meta.attempts).toBe(2)
  })

  it('does not retry a 401 and surfaces a helpful message', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ error: { message: 'bad key' } }, 401))
    await expect(callLLMClassifier({ events: [], isReturning: false, fetchImpl })).rejects.toThrow(
      /Authentication failed/,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('times out when the upstream hangs', async () => {
    const hangingFetch = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    await expect(
      callLLMClassifier({
        events: [],
        isReturning: false,
        fetchImpl: hangingFetch,
        timeoutMs: 10,
        retries: 0,
      }),
    ).rejects.toThrow(/timed out/i)
  })

  it('honors an already-aborted external signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn(async () => jsonRes(okBody(validContent)))
    await expect(
      callLLMClassifier({ events: [], isReturning: false, fetchImpl, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
