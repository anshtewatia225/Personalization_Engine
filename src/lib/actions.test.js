import { describe, it, expect } from 'vitest'
import { recommendedAction } from './actions.js'
import { extractFeatures } from './features.js'

const ev = (type, detail = '') => ({ type, detail })
const featuresFor = (events, isReturning = false) => extractFeatures(events, isReturning)

describe('recommendedAction', () => {
  it('builds a state-aware nudge for every state', () => {
    const f = featuresFor([ev('PRODUCT_VIEW', 'Nimbus Monitor — $329')])
    expect(recommendedAction('BROWSER', [ev('PAGE_VIEW')], f)).toMatch(/trending/i)
    expect(recommendedAction('COMPARER', [], f)).toMatch(/comparison/i)
    expect(recommendedAction('CART_ABANDONER', [], f)).toMatch(/cart-recovery/i)
    expect(recommendedAction('LOYAL_CUSTOMER', [], f)).toMatch(/reorder/i)
  })

  it('returns an em dash for an unknown state', () => {
    expect(recommendedAction('MYSTERY', [], featuresFor([]))).toBe('—')
  })

  it('pulls the product name out of cart details', () => {
    const events = [ev('ADD_TO_CART', 'Velocity Trainer X (size 10)')]
    const action = recommendedAction('CART_ABANDONER', events, featuresFor(events))
    expect(action).toContain('Velocity Trainer X')
  })

  it('names the failed coupon for discount seekers', () => {
    const events = [ev('COUPON_ATTEMPT', 'tried code SAVE20 — rejected')]
    const action = recommendedAction('DISCOUNT_SEEKER', events, featuresFor(events))
    expect(action).toContain('SAVE20')
    expect(action).toMatch(/failed/i)
  })

  it('notes when a cart abandoner reached checkout', () => {
    const events = [
      ev('ADD_TO_CART', 'Desk (walnut)'),
      ev('CHECKOUT_START'),
      ev('CHECKOUT_ABANDON'),
    ]
    const action = recommendedAction('CART_ABANDONER', events, featuresFor(events))
    expect(action).toMatch(/reached checkout/i)
  })
})
