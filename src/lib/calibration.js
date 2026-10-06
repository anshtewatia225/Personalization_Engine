// Isotonic regression (pool-adjacent-violators) for confidence calibration.
// Fits a monotonic map from raw confidence -> empirical accuracy, so a stated
// "80% confident" actually corresponds to ~80% empirical correctness.

export function fitIsotonic(samples) {
  const sorted = [...samples]
    .filter((s) => Number.isFinite(s.confidence))
    .sort((a, b) => a.confidence - b.confidence)

  if (sorted.length === 0) return { thresholds: [], values: [] }

  // Pool samples sharing the same raw confidence so each x maps to one value.
  const grouped = new Map()
  for (const sample of sorted) {
    const g = grouped.get(sample.confidence) || { confidence: sample.confidence, sum: 0, count: 0 }
    g.sum += sample.correct ? 1 : 0
    g.count += 1
    grouped.set(sample.confidence, g)
  }
  const points = [...grouped.values()].sort((a, b) => a.confidence - b.confidence)

  const blocks = []
  for (const point of points) {
    blocks.push({ sum: point.sum, count: point.count, maxX: point.confidence })
    while (
      blocks.length > 1 &&
      blocks[blocks.length - 2].sum / blocks[blocks.length - 2].count >
        blocks[blocks.length - 1].sum / blocks[blocks.length - 1].count
    ) {
      const b = blocks.pop()
      const a = blocks.pop()
      blocks.push({ sum: a.sum + b.sum, count: a.count + b.count, maxX: b.maxX })
    }
  }

  return {
    thresholds: blocks.map((b) => b.maxX / 100),
    values: blocks.map((b) => b.sum / b.count),
  }
}

export function applyIsotonic(model, confidence) {
  const { thresholds, values } = model || {}
  if (!Array.isArray(thresholds) || thresholds.length === 0) return confidence
  const x = Math.max(0, Math.min(1, confidence / 100))
  let i = 0
  while (i < thresholds.length && x > thresholds[i]) i++
  if (i >= values.length) i = values.length - 1
  return Math.round(values[i] * 100)
}
