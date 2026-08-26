// LLM call + prompt construction. The browser hits a proxy that attaches the
// Groq key server-side: the Vite dev proxy (/api/groq) locally, or the deployed
// backend (VITE_API_BASE_URL) in production.

import { STATES } from '../constants/presets.js'

export const GROQ_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/groq'
export const GROQ_MODEL = 'llama-3.3-70b-versatile'

const VALID_STATES = Object.keys(STATES)

export function buildPrompt(events, isReturning) {
  const system =
    'You are a real-time ecommerce shopper intent classifier. Given a sequence of user session events, classify the shopper into exactly ONE state: BROWSER, COMPARER, DISCOUNT_SEEKER, CART_ABANDONER, or LOYAL_CUSTOMER. Respond ONLY with valid JSON, no markdown: { classification, confidence (0-100), evidence (array of 3 strings), recommended_action (string), reasoning (string, 2 sentences) }'

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

export async function callLLMClassifier({ events, isReturning, baseUrl = GROQ_BASE_URL }) {
  const { system, user } = buildPrompt(events, isReturning)

  let res
  try {
    res = await fetch(`${baseUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1000,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
  } catch (e) {
    throw new Error(`Network error reaching the classifier: ${e.message}`)
  }

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
    throw new Error(`Classifier request failed (${res.status}). ${detail}`.trim())
  }

  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('Classifier returned an empty response.')

  return validate(extractJson(text))
}
