import { describe, it, expect } from 'vitest'
import { RULES, runRules, STRONG_CONFIDENCE } from './rules.js'
import { extractFeatures } from './features.js'
import { PRESETS, STATE_KEYS } from '../constants/presets.js'

const byId = (id) => PRESETS.find((p) => p.id === id)
const classifyPreset = (id) => {
  const p = byId(id)
  return runRules(extractFeatures(p.events, p.isReturning))
}

describe('RULES definition', () => {
  it('has unique ids across all rules', () => {
    const ids = RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only votes for known states', () => {
    for (const rule of RULES) expect(STATE_KEYS).toContain(rule.state)
  })
})

describe('runRules', () => {
  it('defaults to Browser at confidence 30 when nothing fires', () => {
    const noneFiring = RULES.map((r) => r.id)
    const result = runRules(extractFeatures([], false), noneFiring)
    expect(result.classification).toBe('BROWSER')
    expect(result.confidence).toBe(30)
    expect(result.isStrong).toBe(false)
    expect(result.firedRules).toHaveLength(0)
  })

  it('classifies the labeled presets as expected (except the deliberate miss)', () => {
    expect(classifyPreset('discount-hunter').classification).toBe('DISCOUNT_SEEKER')
    expect(classifyPreset('hesitant-buyer').classification).toBe('CART_ABANDONER')
    expect(classifyPreset('window-shopper').classification).toBe('BROWSER')
    expect(classifyPreset('spec-comparer').classification).toBe('COMPARER')
    expect(classifyPreset('returning-regular').classification).toBe('LOYAL_CUSTOMER')
    // The Torn Shopper is intentionally ambiguous: rules pick COMPARER while the
    // business label is CART_ABANDONER — this documents the known divergence.
    expect(classifyPreset('torn-shopper').classification).toBe('COMPARER')
  })

  it('gives a dominant single-state win high confidence', () => {
    const result = classifyPreset('discount-hunter')
    expect(result.confidence).toBe(95)
    expect(result.isStrong).toBe(true)
  })

  it('keeps confidence within bounds and weak on a genuinely mixed session', () => {
    const torn = classifyPreset('torn-shopper')
    const total = STATE_KEYS.reduce((sum, s) => sum + torn.scores[s], 0)
    expect(total).toBeGreaterThan(0)
    expect(torn.confidence).toBeGreaterThanOrEqual(35)
    expect(torn.confidence).toBeLessThanOrEqual(96)
    expect(torn.isStrong).toBe(false)
  })

  it('omits rules passed in disabledIds and lets the tally shift', () => {
    const features = extractFeatures(byId('discount-hunter').events, false)
    const withAll = runRules(features)
    const discounted = runRules(features, ['coupon-repeat', 'coupon-single', 'deal-search'])
    expect(withAll.classification).toBe('DISCOUNT_SEEKER')
    expect(discounted.firedRules).toHaveLength(0)
    expect(discounted.scores.DISCOUNT_SEEKER).toBe(0)
  })

  it('exposes STRONG_CONFIDENCE as the strength gate', () => {
    expect(STRONG_CONFIDENCE).toBe(65)
    const strong = classifyPreset('hesitant-buyer')
    expect(strong.isStrong).toBe(strong.confidence >= STRONG_CONFIDENCE)
  })

  it('records an explanation for every fired rule', () => {
    for (const fired of classifyPreset('torn-shopper').firedRules) {
      expect(fired.explanation).toBeTruthy()
      expect(fired.weight).toBeGreaterThan(0)
    }
  })
})
