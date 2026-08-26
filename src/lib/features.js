// Derives deterministic signals from the raw event stream. Rules score off these.

import { EVENT_TYPES } from '../constants/presets.js'

// Search/URL terms that imply price sensitivity.
const DEAL_KEYWORDS = ['discount', 'promo', 'coupon', 'deal', 'sale', 'code', 'offer', 'cheap', 'clearance']

function countByType(events) {
  const counts = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0]))
  for (const e of events) {
    if (counts[e.type] === undefined) counts[e.type] = 0
    counts[e.type] += 1
  }
  return counts
}

export function extractFeatures(events, isReturning) {
  const counts = countByType(events)

  const dealSearches = events.filter(
    (e) =>
      (e.type === 'SEARCH' || e.type === 'PAGE_VIEW') &&
      DEAL_KEYWORDS.some((k) => e.detail.toLowerCase().includes(k)),
  ).length

  const addToCart = counts.ADD_TO_CART
  const removeFromCart = counts.REMOVE_FROM_CART
  const checkoutStarts = counts.CHECKOUT_START
  const checkoutAbandons = counts.CHECKOUT_ABANDON

  // 0 = browse, 1 = product, 2 = cart, 3 = checkout
  let funnelDepth = 0
  if (counts.PRODUCT_VIEW > 0) funnelDepth = 1
  if (addToCart > 0) funnelDepth = 2
  if (checkoutStarts > 0) funnelDepth = 3

  return {
    total: events.length,
    counts,
    isReturning: Boolean(isReturning),

    couponAttempts: counts.COUPON_ATTEMPT,
    dealSearches,
    compareViews: counts.COMPARE_VIEW,
    productViews: counts.PRODUCT_VIEW,
    pageViews: counts.PAGE_VIEW,
    searches: counts.SEARCH,
    repeatVisits: counts.REPEAT_VISIT,
    addToCart,
    removeFromCart,
    netCartAdds: addToCart - removeFromCart,
    checkoutStarts,
    checkoutAbandons,

    // Derived booleans the rules read against.
    hasCartActivity: addToCart > 0 || removeFromCart > 0,
    reachedCheckout: checkoutStarts > 0,
    abandonedCheckout: checkoutAbandons > 0,
    funnelDepth,
  }
}

// Display-friendly signal list for the Signals tab.
export function signalRows(f) {
  return [
    { label: 'Total events', value: f.total },
    { label: 'Return visitor', value: f.isReturning ? 'yes' : 'no' },
    { label: 'Funnel depth', value: ['browse', 'product', 'cart', 'checkout'][f.funnelDepth] },
    { label: 'Product views', value: f.productViews },
    { label: 'Compare views', value: f.compareViews },
    { label: 'Deal-intent searches', value: f.dealSearches },
    { label: 'Coupon attempts', value: f.couponAttempts },
    { label: 'Add to cart', value: f.addToCart },
    { label: 'Removed from cart', value: f.removeFromCart },
    { label: 'Reached checkout', value: f.reachedCheckout ? 'yes' : 'no' },
    { label: 'Abandoned checkout', value: f.abandonedCheckout ? 'yes' : 'no' },
    { label: 'Repeat visits', value: f.repeatVisits },
  ]
}
