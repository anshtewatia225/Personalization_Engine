// LLM call + prompt construction. The browser hits a proxy that attaches the
// Groq key server-side: the Vite dev proxy (/api/groq) locally, or the deployed
// backend (VITE_API_BASE_URL) in production.

import { STATES } from '../constants/presets.js'
import { sanitizeEvents } from './sanitize.js'

export const GROQ_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '/api/groq'
export const GROQ_MODEL = 'openai/gpt-oss-120b'
export const PROMPT_VERSION = 'v3'

// Approximate USD price per 1M tokens, used only for a rough cost readout.
const PRICING = {
  'openai/gpt-oss-120b': { input: 0.15, output: 0.75 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
}

const VALID_STATES = Object.keys(STATES)
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_RETRIES = 2

export function estimateCost(model, usage) {
  const price = PRICING[model]
  if (!price || !usage) return 0
  const inTok = Number(usage.prompt_tokens) || 0
  const outTok = Number(usage.completion_tokens) || 0
  return (inTok * price.input + outTok * price.output) / 1_000_000
}

export function buildPrompt(events, isReturning) {
  // The rubric defines the task (what each state means). It deliberately does
  // NOT include the rule verdict or scores, so the two classifiers stay
  // independent and agreement remains meaningful. Without definitions the LLM
  // substitutes its own priors — e.g. treating "added to cart, didn't buy" as
  // abandonment, which this taxonomy reserves for abandoned checkouts.
  const system =
    "You are a real-time ecommerce shopper intent classifier. Given a session's events, classify the shopper into exactly ONE state using these definitions:\n" +
    '- BROWSER: browsing pages/products with no cart, coupon, or comparison activity.\n' +
    '- COMPARER: evaluating several products via repeated COMPARE_VIEW (or many product views without adding to cart).\n' +
    '- DISCOUNT_SEEKER: price-sensitive behavior — COUPON_ATTEMPT and/or deal-intent SEARCH or PAGE_VIEW about discounts, promos, coupons, or sales.\n' +
    '- CART_ABANDONER: the shopper explicitly started checkout then abandoned — requires CHECKOUT_START followed by CHECKOUT_ABANDON. Adding to cart without purchasing is NOT abandonment by itself; if there is no CHECKOUT_START/CHECKOUT_ABANDON, do not choose CART_ABANDONER.\n' +
    '- LOYAL_CUSTOMER: a returning visitor who adds to cart and/or checks out without abandoning.\n' +
    'If a session is genuinely mixed, pick the state with the strongest actionable signal and explain the ambiguity in your reasoning. ' +
    'Respond ONLY with valid JSON, no markdown: { classification, confidence (0-100), evidence (array of 3 strings), recommended_action (string), reasoning (string, 2 sentences) }'

  const user =
    `Classify this shopper session:\n\n` +
    `Events (in order):\n` +
    events.map((e, i) => `${i + 1}. [${e.type}] ${e.detail}`).join('\n') +
    `\n\nSession metadata:\n` +
    `- Total events: ${events.length}\n` +
    `- Return visitor: ${isReturning}`

  return { system, user }
}

// JSON mode should return clean JSON; fall back to extracting {...} if not.
function extractJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim())
      } catch {
        /* fall through */
      }
    }
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1))
    }
    throw new Error('Model response was not valid JSON.')
  }
}

function validate(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('Classifier returned an unexpected payload.')
  }
  if (!VALID_STATES.includes(result.classification)) {
    throw new Error(`Unknown classification: ${result.classification}`)
  }
  const confidence = Number(result.confidence)
  return {
    classification: result.classification,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0,
    evidence: Array.isArray(result.evidence) ? result.evidence.slice(0, 3) : [],
    recommended_action: result.recommended_action || '—',
    reasoning: result.reasoning || '',
  }
}

function backoff(attempt) {
  const ms = Math.min(4000, 300 * 2 ** (attempt - 1))
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export async function callLLMClassifier({
  events,
  isReturning,
  baseUrl = GROQ_BASE_URL,
  model = GROQ_MODEL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  signal,
  fetchImpl,
}) {
  const doFetch = fetchImpl || globalThis.fetch
  const safeEvents = sanitizeEvents(events)
  const { system, user } = buildPrompt(safeEvents, isReturning)
  const started = now()

  let attempt = 0
  let lastError

  while (attempt <= retries) {
    attempt++
    const controller = new AbortController()
    let timedOut = false
    const onExternalAbort = () => controller.abort()
    if (signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      signal.addEventListener('abort', onExternalAbort, { once: true })
    }
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      const res = await doFetch(`${baseUrl}/openai/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        let detail = ''
        try {
          const body = await res.json()
          detail = body?.error?.message || ''
        } catch {
          /* ignore parse failure on error body */
        }
        if (res.status === 401) {
          throw new Error('Authentication failed (401). Check VITE_GROQ_API_KEY in your .env file.')
        }
        const err = new Error(`Classifier request failed (${res.status}). ${detail}`.trim())
        err.status = res.status
        if (res.status === 429 || res.status >= 500) {
          lastError = err
          if (attempt <= retries) {
            await backoff(attempt)
            continue
          }
        }
        throw err
      }

      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content
      if (!text) throw new Error('Classifier returned an empty response.')

      const validated = validate(extractJson(text))
      return {
        ...validated,
        meta: {
          model,
          promptVersion: PROMPT_VERSION,
          latencyMs: Math.round(now() - started),
          attempts: attempt,
          usage: data?.usage || null,
          costUsd: estimateCost(model, data?.usage),
        },
      }
    } catch (e) {
      if (controller.signal.aborted && !timedOut) throw e
      if (e.status && e.status !== 429 && e.status < 500) throw e
      if (e.message?.includes('Authentication failed')) throw e

      const wrapped =
        e.status || e.message?.startsWith('Classifier')
          ? e
          : new Error(
              timedOut
                ? `Classifier timed out after ${timeoutMs}ms.`
                : `Network error reaching the classifier: ${e.message}`,
            )
      lastError = wrapped
      if (attempt <= retries) {
        await backoff(attempt)
        continue
      }
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onExternalAbort)
    }
  }

  throw lastError || new Error('Classifier request failed.')
}

export { extractJson, validate }
