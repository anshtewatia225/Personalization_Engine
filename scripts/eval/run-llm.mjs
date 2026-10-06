// Optional LLM evaluation. Requires GROQ_API_KEY. Run: npm run eval:llm
//
// Scores the LLM classifier (via Groq directly) against the same hand-labeled
// preset corpus and a sample of generated sessions, so you can compare it to
// the rule engine on identical inputs.

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { buildPrompt, extractJson, validate, GROQ_MODEL } from '../../src/lib/classify.js'
import { PRESETS, STATE_KEYS } from '../../src/constants/presets.js'
import { accuracy, perClassMetrics, macroF1, confusionMatrix } from '../../src/lib/metrics.js'
import { generateDataset } from './generate.mjs'

const KEY = process.env.GROQ_API_KEY
if (!KEY) {
  console.log('GROQ_API_KEY not set — skipping LLM eval.')
  process.exit(0)
}

const SAMPLE_SIZE = Number(process.env.EVAL_LLM_SAMPLES || 40)
const pct = (x) => `${(x * 100).toFixed(1)}%`
const f3 = (x) => x.toFixed(3)

async function classifyLLM(events, isReturning) {
  const { system, user } = buildPrompt(events, isReturning)
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
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
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const data = await res.json()
  return validate(extractJson(data.choices[0].message.content))
}

async function scoreSessions(sessions) {
  const pairs = []
  for (const s of sessions) {
    try {
      const result = await classifyLLM(s.events, s.isReturning)
      pairs.push({ expected: s.state, predicted: result.classification })
    } catch (e) {
      pairs.push({ expected: s.state, predicted: `ERROR:${e.message}` })
    }
    process.stdout.write('.')
  }
  process.stdout.write('\n')
  return pairs
}

async function main() {
  console.log(
    `Scoring ${PRESETS.length} presets + ${SAMPLE_SIZE} synthetic sessions with ${GROQ_MODEL}...`,
  )

  const presetPairs = []
  for (const p of PRESETS) {
    try {
      const result = await classifyLLM(p.events, p.isReturning)
      presetPairs.push({ expected: p.expectedState, predicted: result.classification })
    } catch (e) {
      presetPairs.push({ expected: p.expectedState, predicted: `ERROR:${e.message}` })
    }
    process.stdout.write('.')
  }
  process.stdout.write('\n')

  const synthetic = generateDataset({ perClass: Math.ceil(SAMPLE_SIZE / 5), seed: 7, noise: 0.3 })
  const syntheticPairs = await scoreSessions(synthetic)

  const perClass = perClassMetrics(syntheticPairs, STATE_KEYS)
  const report = {
    model: GROQ_MODEL,
    presets: { accuracy: accuracy(presetPairs), pairs: presetPairs },
    synthetic: {
      accuracy: accuracy(syntheticPairs),
      macroF1: macroF1(perClass),
      perClass,
      confusion: confusionMatrix(syntheticPairs, STATE_KEYS),
    },
  }

  const here = dirname(fileURLToPath(import.meta.url))
  const outDir = join(here, '..', '..', 'eval')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'results-llm.json'), `${JSON.stringify(report, null, 2)}\n`)

  console.log(`\nPreset accuracy : ${pct(report.presets.accuracy)}`)
  console.log(`Synthetic acc   : ${pct(report.synthetic.accuracy)}`)
  console.log(`Synthetic macroF1: ${f3(report.synthetic.macroF1)}`)
  console.log('\nWrote eval/results-llm.json\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
