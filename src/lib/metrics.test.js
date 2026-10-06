import { describe, it, expect } from 'vitest'
import {
  accuracy,
  confusionMatrix,
  perClassMetrics,
  macroF1,
  calibrationCurve,
  expectedCalibrationError,
} from './metrics.js'

describe('accuracy', () => {
  it('computes hit rate', () => {
    expect(accuracy([])).toBe(0)
    expect(
      accuracy([
        { expected: 'A', predicted: 'A' },
        { expected: 'A', predicted: 'B' },
      ]),
    ).toBe(0.5)
  })
})

describe('confusionMatrix', () => {
  it('counts expected x predicted', () => {
    const m = confusionMatrix(
      [
        { expected: 'A', predicted: 'A' },
        { expected: 'A', predicted: 'B' },
        { expected: 'B', predicted: 'B' },
      ],
      ['A', 'B'],
    )
    expect(m.A.A).toBe(1)
    expect(m.A.B).toBe(1)
    expect(m.B.B).toBe(1)
    expect(m.B.A).toBe(0)
  })
})

describe('perClassMetrics', () => {
  it('computes precision/recall/F1/support for a known example', () => {
    const pairs = [
      { expected: 'A', predicted: 'A' },
      { expected: 'A', predicted: 'B' },
      { expected: 'B', predicted: 'B' },
      { expected: 'B', predicted: 'B' },
    ]
    const m = perClassMetrics(pairs, ['A', 'B'])
    // A: tp1 fp0 fn1 -> p=1, r=0.5, f1=2/3
    expect(m.A.precision).toBe(1)
    expect(m.A.recall).toBe(0.5)
    expect(m.A.f1).toBeCloseTo(2 / 3)
    expect(m.A.support).toBe(2)
    // B: tp2 fp1 fn0 -> p=2/3, r=1, f1=0.8
    expect(m.B.precision).toBeCloseTo(2 / 3)
    expect(m.B.recall).toBe(1)
    expect(m.B.f1).toBeCloseTo(0.8)
  })

  it('macroF1 ignores classes with no support', () => {
    const m = { A: { f1: 1, support: 1 }, B: { f1: 0, support: 0 } }
    expect(macroF1(m)).toBe(1)
  })
})

describe('calibration', () => {
  it('returns zero ECE for a perfectly calibrated sample', () => {
    const samples = [
      { confidence: 50, correct: true },
      { confidence: 50, correct: false },
    ]
    expect(expectedCalibrationError(samples, 10)).toBe(0)
  })

  it('reports large ECE when confidence is unwarranted', () => {
    const samples = [
      { confidence: 95, correct: false },
      { confidence: 95, correct: false },
    ]
    expect(expectedCalibrationError(samples, 10)).toBeGreaterThan(0.9)
  })

  it('calibrationCurve buckets by confidence', () => {
    const curve = calibrationCurve([{ confidence: 95, correct: true }], 10)
    expect(curve).toHaveLength(1)
    expect(curve[0].bin).toBe(9)
    expect(curve[0].accuracy).toBe(1)
  })
})
