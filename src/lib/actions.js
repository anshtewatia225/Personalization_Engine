// Builds a per-session nudge by filling state templates with details pulled
// from the event stream. Deterministic — the LLM's own suggestion is separate.

// These parse mock free-text details; real events would have structured fields.
function cleanProduct(detail) {
  if (!detail) return null
  // "Nimbus 4K Monitor 32\" — $429.00" -> "Nimbus 4K Monitor 32\""
  const name = detail
    .split('—')[0]
    .replace(/\([^)]*\)/g, '')
    .trim()
  return name || null
}

function couponCode(detail) {
  if (!detail) return null
  return detail.match(/\b[A-Z][A-Z0-9]{3,}\b/)?.[0] ?? null
}

function actionContext(events, features) {
  const lastDetail = (type) => [...events].reverse().find((e) => e.type === type)?.detail

  return {
    cartItem: cleanProduct(lastDetail('ADD_TO_CART')),
    lastProduct: cleanProduct(lastDetail('PRODUCT_VIEW')),
    coupon: couponCode(lastDetail('COUPON_ATTEMPT')),
    compareCount: features.compareViews,
    reachedCheckout: features.reachedCheckout,
    isReturning: features.isReturning,
  }
}

// Every slot has a fallback so the copy reads fine when data is missing.
const TEMPLATES = {
  BROWSER: (c) =>
    `Surface trending and bestseller collections${
      c.lastProduct ? ` around "${c.lastProduct}"` : ''
    }, and offer a soft email/notification capture — nurture the visit, don't discount yet.`,

  COMPARER: (c) =>
    `Show a side-by-side comparison for ${
      c.cartItem ?? c.lastProduct ?? 'the products they viewed'
    } with clear differentiators, spec tables, and reviews${
      c.compareCount
        ? ` — they already ran ${c.compareCount} comparison${c.compareCount > 1 ? 's' : ''}.`
        : '.'
    }`,

  DISCOUNT_SEEKER: (c) =>
    `Offer a cart-value coupon${c.cartItem ? ` on ${c.cartItem}` : ''}` +
    (c.coupon
      ? ` — they tried ${c.coupon} and it failed, so beat it with a valid code while intent is high.`
      : ' and surface bundle / price-match deals while intent is high.'),

  CART_ABANDONER: (c) =>
    `Queue a cart-recovery email for ${c.cartItem ?? 'the saved items'} and fire an exit-intent modal` +
    (c.reachedCheckout ? ' — they reached checkout, so they were close.' : '.'),

  LOYAL_CUSTOMER: (c) =>
    `Fast-track ${c.isReturning ? 'this returning member' : 'them'} with 1-click reorder${
      c.cartItem ? ` of ${c.cartItem}` : ''
    }, loyalty points, and early access — avoid discounting to protect margin.`,
}

// Public entry point. The rest of the app never touches the context plumbing.
export function recommendedAction(state, events, features) {
  const template = TEMPLATES[state]
  if (!template) return '—'
  return template(actionContext(events, features))
}
