import { describe, it, expect } from 'vitest'
import { fitIsotonic, applyIsotonic } from './calibration.js'

describe('fitIsotonic', () => {
  it('returns an empty model for no samples', () => {
    expect(fitIsotonic([])).toEqual({ thresholds: [], values: [] })
  })

  it('produces a monotonically non-decreasing value curve', () => {
    const samples = [
      { confidence: 90, correct: false },
      { confidence: 90, correct: true },
      { confidence: 90, correct: false },
      { confidence: 90, correct: false },
    ]
    const model = fitIsotonic(samples)
    for (let i = 1; i < model.values.length; i++) {
      expect(model.values[i]).toBeGreaterThanOrEqual(model.values[i - 1])
    }
  })

  it('shrinks overconfident predictions toward empirical accuracy', () => {
    const samples = [
      ...Array.from({ length: 8 }, () => ({ confidence: 90, correct: false })),
      ...Array.from({ length: 2 }, () => ({ confidence: 90, correct: true })),
    ]
    const model = fitIsotonic(samples)
    // Stated 90% but only 20% correct -> calibrated output around 20.
    expect(applyIsotonic(model, 90)).toBe(20)
  })
})

describe('applyIsotonic', () => {
  it('passes confidence through when the model is empty', () => {
    expect(applyIsotonic({ thresholds: [], values: [] }, 73)).toBe(73)
    expect(applyIsotonic(null, 73)).toBe(73)
  })

  it('clamps out-of-range input', () => {
    const model = fitIsotonic([{ confidence: 50, correct: true }])
    expect(applyIsotonic(model, -10)).toBe(100)
    expect(applyIsotonic(model, 200)).toBe(100)
  })
})
