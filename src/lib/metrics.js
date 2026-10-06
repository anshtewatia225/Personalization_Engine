// Labeled-classification metrics + confidence calibration error. Pure, no
// dependencies — used both by the in-app evaluation tab and the Node eval
// harness in scripts/eval.

export function accuracy(pairs) {
  if (!pairs.length) return 0
  const hits = pairs.filter((p) => p.expected === p.predicted).length
  return hits / pairs.length
}

// pairs: [{ expected, predicted }] -> { [expected]: { [predicted]: count } }
export function confusionMatrix(pairs, labels) {
  const matrix = {}
  for (const actual of labels) {
    matrix[actual] = {}
    for (const predicted of labels) matrix[actual][predicted] = 0
  }
  for (const { expected, predicted } of pairs) {
    if (!matrix[expected]) matrix[expected] = {}
    matrix[expected][predicted] = (matrix[expected][predicted] || 0) + 1
  }
  return matrix
}

// Precision / recall / F1 per label, plus support (number of true instances).
export function perClassMetrics(pairs, labels) {
  const out = {}
  for (const label of labels) {
    let tp = 0
    let fp = 0
    let fn = 0
    for (const { expected, predicted } of pairs) {
      if (predicted === label && expected === label) tp++
      else if (predicted === label && expected !== label) fp++
      else if (predicted !== label && expected === label) fn++
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
    out[label] = { precision, recall, f1, support: tp + fn, tp, fp, fn }
  }
  return out
}

export function macroF1(perClass) {
  const classes = Object.values(perClass).filter((c) => c.support > 0)
  if (!classes.length) return 0
  return classes.reduce((sum, c) => sum + c.f1, 0) / classes.length
}

// samples: [{ confidence: 0..100, correct: boolean }]
// Returns per-bin mean confidence vs empirical accuracy.
export function calibrationCurve(samples, bins = 10) {
  const buckets = Array.from({ length: bins }, () => ({ count: 0, confidence: 0, correct: 0 }))
  for (const s of samples) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((s.confidence / 100) * bins)))
    const b = buckets[idx]
    b.count++
    b.confidence += s.confidence / 100
    b.correct += s.correct ? 1 : 0
  }
  return buckets
    .map((b, i) => ({
      bin: i,
      range: [i / bins, (i + 1) / bins],
      count: b.count,
      avgConfidence: b.count ? b.confidence / b.count : 0,
      accuracy: b.count ? b.correct / b.count : 0,
    }))
    .filter((b) => b.count > 0)
}

// Expected Calibration Error: weighted average |confidence - accuracy|.
export function expectedCalibrationError(samples, bins = 10) {
  if (!samples.length) return 0
  const curve = calibrationCurve(samples, bins)
  return curve.reduce(
    (sum, b) => sum + (b.count / samples.length) * Math.abs(b.avgConfidence - b.accuracy),
    0,
  )
}
