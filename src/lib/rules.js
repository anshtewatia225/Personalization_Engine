// Weighted rules vote for a state from the extracted features. The engine sums
// votes, picks the winner, and derives confidence from how dominant the win is.

import { STATE_KEYS } from '../constants/presets.js'

// Ordered by state so ties break deterministically and predictably.
export const RULES = [
  // ---- DISCOUNT_SEEKER -----------------------------------------------------
  {
    id: 'coupon-repeat',
    label: 'Repeated coupon attempts',
    state: 'DISCOUNT_SEEKER',
    weight: 3,
    description: 'Two or more coupon attempts is a hard signal of price sensitivity.',
    test: (f) => f.couponAttempts >= 2,
    explain: (f) => `Tried ${f.couponAttempts} coupon codes`,
  },
  {
    id: 'coupon-single',
    label: 'Any coupon attempt',
    state: 'DISCOUNT_SEEKER',
    weight: 1.5,
    description: 'A single coupon attempt is a soft deal-seeking signal.',
    test: (f) => f.couponAttempts >= 1,
    explain: () => 'Attempted a coupon code',
  },
  {
    id: 'deal-search',
    label: 'Deal-oriented searches',
    state: 'DISCOUNT_SEEKER',
    weight: 2.5,
    description: 'Searches/pages mentioning discount, promo, sale, etc.',
    test: (f) => f.dealSearches >= 1,
    explain: (f) => `${f.dealSearches} deal-oriented search/page view(s)`,
  },

  // ---- COMPARER ------------------------------------------------------------
  {
    id: 'compare-repeat',
    label: 'Multiple comparisons',
    state: 'COMPARER',
    weight: 3,
    description: 'Two or more compare views is the defining comparer behavior.',
    test: (f) => f.compareViews >= 2,
    explain: (f) => `Ran ${f.compareViews} product comparisons`,
  },
  {
    id: 'compare-single',
    label: 'Any comparison',
    state: 'COMPARER',
    weight: 1.5,
    description: 'A single compare view is a soft comparer signal.',
    test: (f) => f.compareViews >= 1,
    explain: () => 'Used the compare view',
  },
  {
    id: 'many-products-no-cart',
    label: 'Many products, no cart',
    state: 'COMPARER',
    weight: 1,
    description: 'Viewing lots of products without adding hints at evaluation.',
    test: (f) => f.productViews >= 4 && f.addToCart === 0,
    explain: (f) => `Viewed ${f.productViews} products without adding any`,
  },

  // ---- CART_ABANDONER ------------------------------------------------------
  {
    id: 'checkout-abandon',
    label: 'Abandoned checkout',
    state: 'CART_ABANDONER',
    weight: 3,
    description: 'Started checkout then abandoned — the core abandoner signal.',
    test: (f) => f.abandonedCheckout,
    explain: () => 'Abandoned an in-progress checkout',
  },
  {
    id: 'intent-then-abandon',
    label: 'Cart intent then abandon',
    state: 'CART_ABANDONER',
    weight: 1,
    description: 'Added to cart and reached checkout before abandoning — high intent lost.',
    test: (f) => f.addToCart >= 1 && f.reachedCheckout && f.abandonedCheckout,
    explain: () => 'Reached checkout with items, then left',
  },
  {
    id: 'cart-removal',
    label: 'Removed from cart',
    state: 'CART_ABANDONER',
    weight: 1,
    description: 'Removing items signals wavering purchase intent.',
    test: (f) => f.removeFromCart >= 1,
    explain: (f) => `Removed ${f.removeFromCart} item(s) from cart`,
  },

  // ---- LOYAL_CUSTOMER ------------------------------------------------------
  {
    id: 'returning-buyer',
    label: 'Returning buyer, no abandon',
    state: 'LOYAL_CUSTOMER',
    weight: 3,
    description: 'Repeat visitor who adds to cart and does not abandon.',
    test: (f) => f.isReturning && f.repeatVisits >= 1 && f.addToCart >= 1 && !f.abandonedCheckout,
    explain: () => 'Returning visitor added to cart without abandoning',
  },
  {
    id: 'returning-checkout',
    label: 'Returning, clean checkout',
    state: 'LOYAL_CUSTOMER',
    weight: 2,
    description: 'Repeat visitor who reaches checkout without bailing.',
    test: (f) => f.isReturning && f.reachedCheckout && !f.abandonedCheckout,
    explain: () => 'Returning visitor reached checkout smoothly',
  },

  // ---- BROWSER -------------------------------------------------------------
  {
    id: 'browse-heavy',
    label: 'Browsing, no cart',
    state: 'BROWSER',
    weight: 2,
    description: 'Plenty of page/product views but no cart activity at all.',
    test: (f) => !f.hasCartActivity && f.pageViews + f.productViews >= 3,
    explain: (f) => `${f.pageViews + f.productViews} views, no cart activity`,
  },
  {
    id: 'pure-browse',
    label: 'Pure browsing',
    state: 'BROWSER',
    weight: 1,
    description: 'No cart, no coupons, no comparisons — just looking around.',
    test: (f) => !f.hasCartActivity && f.couponAttempts === 0 && f.compareViews === 0,
    explain: () => 'No cart, coupon, or comparison activity',
  },
]

const STRONG_CONFIDENCE = 65

function emptyScores() {
  return Object.fromEntries(STATE_KEYS.map((s) => [s, 0]))
}

// Winning state + confidence in [35, 96], rewarding dominance (share of votes)
// and margin (lead over runner-up). No matches -> BROWSER at low confidence.
function scoreToDecision(scores) {
  const ranked = STATE_KEYS.map((s) => [s, scores[s]]).sort((a, b) => b[1] - a[1])
  const [topState, topScore] = ranked[0]
  const secondScore = ranked[1]?.[1] ?? 0

  if (topScore === 0) return { classification: 'BROWSER', confidence: 30 }

  const total = ranked.reduce((sum, [, v]) => sum + v, 0)
  const dominance = topScore / total // 0..1
  const margin = (topScore - secondScore) / topScore // 0..1
  const raw = 45 + dominance * 30 + margin * 20
  return { classification: topState, confidence: Math.round(Math.min(96, Math.max(35, raw))) }
}

// disabledIds lets the UI switch individual rules off and see the effect live.
export function runRules(features, disabledIds = []) {
  const disabled = new Set(disabledIds)
  const scores = emptyScores()
  const firedRules = []

  for (const rule of RULES) {
    if (disabled.has(rule.id)) continue
    if (rule.test(features)) {
      scores[rule.state] += rule.weight
      firedRules.push({
        id: rule.id,
        label: rule.label,
        state: rule.state,
        weight: rule.weight,
        explanation: rule.explain(features),
      })
    }
  }

  const { classification, confidence } = scoreToDecision(scores)
  return {
    classification,
    confidence,
    isStrong: confidence >= STRONG_CONFIDENCE && firedRules.length > 0,
    scores,
    firedRules,
  }
}

export { STRONG_CONFIDENCE }
