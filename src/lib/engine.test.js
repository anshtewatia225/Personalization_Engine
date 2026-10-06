import { describe, it, expect } from 'vitest'
import { decide, classifyTimeline } from './engine.js'
import { runRules, RULES } from './rules.js'
import { extractFeatures } from './features.js'
import { PRESETS } from '../constants/presets.js'

const discount = PRESETS.find((p) => p.id === 'discount-hunter')
const emptyRules = runRules(
  extractFeatures([], false),
  RULES.map((r) => r.id),
)
const strongRules = runRules(extractFeatures(discount.events, false))

describe('decide', () => {
  it('returns rules alone (labeled low confidence) without an LLM result', () => {
    expect(decide(emptyRules, null)).toMatchObject({
      classification: 'BROWSER',
      source: 'Rule engine (low confidence)',
      agreement: null,
    })
    expect(decide(strongRules, null).source).toBe('Rule engine')
  })

  it('boosts confidence when both classifiers agree', () => {
    const result = decide(
      { classification: 'BROWSER', confidence: 80, isStrong: true },
      { classification: 'BROWSER', confidence: 90 },
    )
    expect(result.classification).toBe('BROWSER')
    expect(result.confidence).toBe(93)
    expect(result.source).toBe('Hybrid — rules & LLM agree')
    expect(result.agreement).toBe(true)
  })

  it('caps the agreement boost at 98', () => {
    const result = decide(
      { classification: 'BROWSER', confidence: 96, isStrong: true },
      { classification: 'BROWSER', confidence: 100 },
    )
    expect(result.confidence).toBe(98)
  })

  it('keeps a strong rule verdict on disagreement', () => {
    const result = decide(
      { classification: 'BROWSER', confidence: 80, isStrong: true },
      { classification: 'COMPARER', confidence: 70 },
    )
    expect(result.classification).toBe('BROWSER')
    expect(result.confidence).toBe(80)
    expect(result.source).toBe('Rule engine (overrode LLM)')
    expect(result.agreement).toBe(false)
  })

  it('defers to the LLM when the rules are uncertain', () => {
    const result = decide(
      { classification: 'BROWSER', confidence: 40, isStrong: false },
      { classification: 'COMPARER', confidence: 70 },
    )
    expect(result.classification).toBe('COMPARER')
    expect(result.confidence).toBe(70)
    expect(result.source).toBe('LLM (rules were uncertain)')
  })
})

describe('classifyTimeline', () => {
  it('produces one step per growing prefix', () => {
    const steps = classifyTimeline(discount.events, false)
    expect(steps).toHaveLength(discount.events.length)
    expect(steps[0].index).toBe(1)
    expect(steps[0].event).toEqual(discount.events[0])
    expect(steps.at(-1).index).toBe(discount.events.length)
    expect(steps.at(-1).classification).toBe('DISCOUNT_SEEKER')
  })

  it('honors disabled rules while tracing', () => {
    const steps = classifyTimeline(discount.events, false, [
      'coupon-repeat',
      'coupon-single',
      'deal-search',
    ])
    expect(steps.at(-1).classification).not.toBe('DISCOUNT_SEEKER')
  })

  it('returns an empty timeline for an empty stream', () => {
    expect(classifyTimeline([], false)).toEqual([])
  })
})
