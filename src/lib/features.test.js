import { describe, it, expect } from 'vitest'
import { extractFeatures, signalRows } from './features.js'
import { EVENT_TYPES } from '../constants/presets.js'

const ev = (type, detail = '') => ({ type, detail })

describe('extractFeatures', () => {
  it('returns zeroed signals for an empty stream', () => {
    const f = extractFeatures([], false)
    expect(f.total).toBe(0)
    expect(f.funnelDepth).toBe(0)
    expect(f.hasCartActivity).toBe(false)
    expect(f.reachedCheckout).toBe(false)
    expect(f.abandonedCheckout).toBe(false)
    expect(f.netCartAdds).toBe(0)
    for (const type of EVENT_TYPES) expect(f.counts[type]).toBe(0)
  })

  it('counts events by type', () => {
    const f = extractFeatures([ev('PAGE_VIEW'), ev('PAGE_VIEW'), ev('ADD_TO_CART')], false)
    expect(f.counts.PAGE_VIEW).toBe(2)
    expect(f.counts.ADD_TO_CART).toBe(1)
    expect(f.total).toBe(3)
  })

  it('detects deal-intent searches/pages case-insensitively', () => {
    const f = extractFeatures(
      [
        ev('SEARCH', 'searched "running shoes DISCOUNT"'),
        ev('PAGE_VIEW', 'viewed /sale landing'),
        ev('PRODUCT_VIEW', 'Velocity Trainer'),
        ev('SEARCH', 'searched "trail boots"'),
      ],
      false,
    )
    expect(f.dealSearches).toBe(2)
  })

  it('advances funnel depth browse -> product -> cart -> checkout', () => {
    expect(extractFeatures([ev('PAGE_VIEW')], false).funnelDepth).toBe(0)
    expect(extractFeatures([ev('PAGE_VIEW'), ev('PRODUCT_VIEW')], false).funnelDepth).toBe(1)
    expect(extractFeatures([ev('PRODUCT_VIEW'), ev('ADD_TO_CART')], false).funnelDepth).toBe(2)
    expect(extractFeatures([ev('ADD_TO_CART'), ev('CHECKOUT_START')], false).funnelDepth).toBe(3)
  })

  it('computes net cart adds and cart/checkout booleans', () => {
    const f = extractFeatures(
      [ev('ADD_TO_CART'), ev('ADD_TO_CART'), ev('REMOVE_FROM_CART'), ev('CHECKOUT_START')],
      true,
    )
    expect(f.addToCart).toBe(2)
    expect(f.removeFromCart).toBe(1)
    expect(f.netCartAdds).toBe(1)
    expect(f.hasCartActivity).toBe(true)
    expect(f.reachedCheckout).toBe(true)
    expect(f.isReturning).toBe(true)
  })

  it('marks abandoned checkout from a CHECKOUT_ABANDON event', () => {
    const f = extractFeatures([ev('CHECKOUT_START'), ev('CHECKOUT_ABANDON')], false)
    expect(f.abandonedCheckout).toBe(true)
  })

  it('signalRows exposes a display row per signal', () => {
    const rows = signalRows(extractFeatures([ev('PRODUCT_VIEW')], false))
    expect(rows).toHaveLength(12)
    expect(rows.find((r) => r.label === 'Funnel depth').value).toBe('product')
  })
})
