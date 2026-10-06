// Offline evaluation harness for the deterministic rule engine.
// Run: npm run eval
//
// Generates a labeled synthetic corpus, splits train/test, and reports rule
// accuracy, per-class precision/recall/F1, a confusion matrix, and confidence
// calibration (ECE) before and after isotonic calibration fit on the train set.

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { extractFeatures } from '../../src/lib/features.js'
import { runRules } from '../../src/lib/rules.js'
import { PRESETS, STATE_KEYS } from '../../src/constants/presets.js'
import {
  accuracy,
  perClassMetrics,
  confusionMatrix,
  macroF1,
  expectedCalibrationError,
} from '../../src/lib/metrics.js'
import { fitIsotonic, applyIsotonic } from '../../src/lib/calibration.js'
import { generateDataset, trainTestSplit } from './generate.mjs'

const LABELS = STATE_KEYS
const CONFIG = { perClass: 80, seed: 42, noise: 0.3 }

const pct = (x) => `${(x * 100).toFixed(1)}%`
const f3 = (x) => x.toFixed(3)

function predict(session) {
  const result = runRules(extractFeatures(session.events, session.isReturning))
  return { classification: result.classification, confidence: result.confidence }
}

function score(sessions) {
  const samples = sessions.map((s) => {
    const { classification, confidence } = predict(s)
    return {
      expected: s.state,
      predicted: classification,
      confidence,
      correct: classification === s.state,
    }
  })
  const pairs = samples.map(({ expected, predicted }) => ({ expected, predicted }))
  return { samples, pairs }
}

function ruleReport(pairs) {
  const perClass = perClassMetrics(pairs, LABELS)
  return {
    accuracy: accuracy(pairs),
    macroF1: macroF1(perClass),
    perClass,
    confusion: confusionMatrix(pairs, LABELS),
  }
}

function markdown({ dataset, split, rule, calibrated, presets }) {
  const lines = []
  lines.push('# Evaluation Results')
  lines.push('')
  lines.push(
    `Generated ${dataset.total} synthetic sessions (${CONFIG.perClass}/class, seed ${CONFIG.seed}, ` +
      `noise ${CONFIG.noise}); ${split.train} train / ${split.test} test. Rules are deterministic, ` +
      `so only the test split is scored below.`,
  )
  lines.push('')
  lines.push('## Rule engine — held-out test split')
  lines.push('')
  lines.push(`- **Accuracy:** ${pct(rule.accuracy)}`)
  lines.push(`- **Macro F1:** ${f3(rule.macroF1)}`)
  lines.push(`- **ECE (raw confidence):** ${f3(calibrated.eceBefore)}`)
  lines.push(`- **ECE (isotonic-calibrated):** ${f3(calibrated.eceAfter)}`)
  lines.push('')
  lines.push('### Per-class metrics')
  lines.push('')
  lines.push('| State | Support | Precision | Recall | F1 |')
  lines.push('| --- | ---: | ---: | ---: | ---: |')
  for (const label of LABELS) {
    const m = rule.perClass[label]
    lines.push(`| ${label} | ${m.support} | ${f3(m.precision)} | ${f3(m.recall)} | ${f3(m.f1)} |`)
  }
  lines.push('')
  lines.push('### Confusion matrix (rows = expected, cols = predicted)')
  lines.push('')
  lines.push(`| expected \\ predicted | ${LABELS.join(' | ')} |`)
  lines.push(`| --- | ${LABELS.map(() => '---:').join(' | ')} |`)
  for (const actual of LABELS) {
    const row = LABELS.map((pred) => rule.confusion[actual][pred] ?? 0)
    lines.push(`| ${actual} | ${row.join(' | ')} |`)
  }
  lines.push('')
  lines.push('## Hand-labeled preset corpus')
  lines.push('')
  lines.push(`- **Accuracy:** ${pct(presets.accuracy)} (${presets.correct}/${presets.total})`)
  lines.push('')
  lines.push('| Session | Expected | Predicted | Correct |')
  lines.push('| --- | --- | --- | :---: |')
  for (const row of presets.rows) {
    lines.push(`| ${row.name} | ${row.expected} | ${row.predicted} | ${row.correct ? '✓' : '✗'} |`)
  }
  lines.push('')
  lines.push('## How to read this')
  lines.push('')
  lines.push(
    'The synthetic corpus is reproducible and deliberately noisy (events are added, dropped, or ' +
      'blended into ~30% of sessions, and ambiguous "torn" sessions are labeled by business ' +
      'priority), so the numbers are an honest signal rather than a rigged 100%. The hand-labeled ' +
      'preset corpus (n=6) is illustrative, not statistical. ' +
      "Isotonic calibration maps the rules' raw confidence onto empirical accuracy; a lower ECE " +
      'after calibration means "80% confident" is closer to "80% correct".',
  )
  lines.push('')
  return lines.join('\n')
}

function main() {
  const dataset = generateDataset(CONFIG)
  const { train, test } = trainTestSplit(dataset)
  const trainEval = score(train)
  const testEval = score(test)
  const rule = ruleReport(testEval.pairs)

  const calibrator = fitIsotonic(
    trainEval.samples.map((s) => ({ confidence: s.confidence, correct: s.correct })),
  )
  const eceBefore = expectedCalibrationError(
    testEval.samples.map((s) => ({ confidence: s.confidence, correct: s.correct })),
  )
  const eceAfter = expectedCalibrationError(
    testEval.samples.map((s) => ({
      confidence: applyIsotonic(calibrator, s.confidence),
      correct: s.correct,
    })),
  )

  const presetRows = PRESETS.map((p) => {
    const { classification } = predict({ events: p.events, isReturning: p.isReturning })
    return {
      name: p.name,
      expected: p.expectedState,
      predicted: classification,
      correct: classification === p.expectedState,
    }
  })
  const presets = {
    rows: presetRows,
    total: presetRows.length,
    correct: presetRows.filter((r) => r.correct).length,
    accuracy: presetRows.filter((r) => r.correct).length / presetRows.length,
  }

  const report = {
    dataset: { total: dataset.length, ...CONFIG },
    split: { train: train.length, test: test.length },
    rule,
    calibrated: { eceBefore, eceAfter, calibrator },
    presets,
  }

  const here = dirname(fileURLToPath(import.meta.url))
  const outDir = join(here, '..', '..', 'eval')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(join(outDir, 'RESULTS.md'), `${markdown(report)}\n`)

  console.log('\nRule engine — held-out test split')
  console.log(`  accuracy : ${pct(rule.accuracy)}`)
  console.log(`  macro F1 : ${f3(rule.macroF1)}`)
  console.log(`  ECE raw   : ${f3(eceBefore)}`)
  console.log(`  ECE calib : ${f3(eceAfter)}`)
  console.log(`  presets   : ${presets.correct}/${presets.total} (${pct(presets.accuracy)})`)
  console.log('\nWrote eval/RESULTS.md and eval/results.json\n')
}

main()
