// Event types, the five states (+ colors), and labeled sessions used as both
// presets and the batch-eval dataset. Each session has an expectedState label.

export const EVENT_TYPES = [
  'PAGE_VIEW',
  'PRODUCT_VIEW',
  'SEARCH',
  'COUPON_ATTEMPT',
  'ADD_TO_CART',
  'REMOVE_FROM_CART',
  'CHECKOUT_START',
  'CHECKOUT_ABANDON',
  'COMPARE_VIEW',
  'REPEAT_VISIT',
]

// Tailwind classes are full literal strings (not interpolated) so the JIT
// compiler can see and emit them.
export const STATES = {
  BROWSER: {
    label: 'Browser',
    badgeClass: 'bg-slate-600/30 text-slate-200 ring-1 ring-slate-500/40',
    dotClass: 'bg-slate-400',
    barClass: 'bg-slate-400',
  },
  COMPARER: {
    label: 'Comparer',
    badgeClass: 'bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/40',
    dotClass: 'bg-blue-400',
    barClass: 'bg-blue-500',
  },
  DISCOUNT_SEEKER: {
    label: 'Discount Seeker',
    badgeClass: 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40',
    dotClass: 'bg-amber-400',
    barClass: 'bg-amber-500',
  },
  CART_ABANDONER: {
    label: 'Cart Abandoner',
    badgeClass: 'bg-red-500/20 text-red-200 ring-1 ring-red-400/40',
    dotClass: 'bg-red-400',
    barClass: 'bg-red-500',
  },
  LOYAL_CUSTOMER: {
    label: 'Loyal Customer',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40',
    dotClass: 'bg-emerald-400',
    barClass: 'bg-emerald-500',
  },
}

export const STATE_KEYS = Object.keys(STATES)

// Recommended nudges are generated per-session in lib/actions.js (deterministic,
// context-aware) rather than living here as static strings.

export const PRESETS = [
  {
    id: 'discount-hunter',
    name: 'Discount Hunter',
    description: 'Searches deals, repeatedly tries coupons, stalls at the cart.',
    isReturning: false,
    expectedState: 'DISCOUNT_SEEKER',
    events: [
      { type: 'SEARCH', detail: 'searched "running shoes discount"' },
      { type: 'PRODUCT_VIEW', detail: 'Velocity Trainer X — $129.99' },
      { type: 'SEARCH', detail: 'searched "Velocity Trainer promo code"' },
      { type: 'ADD_TO_CART', detail: 'Velocity Trainer X (size 10)' },
      { type: 'COUPON_ATTEMPT', detail: 'tried code SAVE20 — rejected' },
      { type: 'COUPON_ATTEMPT', detail: 'tried code WELCOME10 — rejected' },
      { type: 'PAGE_VIEW', detail: 'viewed /deals landing page' },
    ],
  },
  {
    id: 'hesitant-buyer',
    name: 'Hesitant Buyer',
    description: 'Adds to cart, starts checkout, then bails before paying.',
    isReturning: false,
    expectedState: 'CART_ABANDONER',
    events: [
      { type: 'PRODUCT_VIEW', detail: 'Aurora Standing Desk — $419.00' },
      { type: 'PRODUCT_VIEW', detail: 'read reviews tab (4.6 / 5)' },
      { type: 'ADD_TO_CART', detail: 'Aurora Standing Desk (walnut)' },
      { type: 'CHECKOUT_START', detail: 'entered shipping details' },
      { type: 'PAGE_VIEW', detail: 'viewed shipping & returns policy' },
      { type: 'CHECKOUT_ABANDON', detail: 'closed tab at payment step' },
    ],
  },
  {
    id: 'window-shopper',
    name: 'Window Shopper',
    description: 'Lots of browsing across categories, no cart activity at all.',
    isReturning: false,
    expectedState: 'BROWSER',
    events: [
      { type: 'PAGE_VIEW', detail: 'landed on homepage' },
      { type: 'PAGE_VIEW', detail: 'browsed /category/outerwear' },
      { type: 'PRODUCT_VIEW', detail: 'Summit Down Parka — $239.00' },
      { type: 'PAGE_VIEW', detail: 'browsed /category/footwear' },
      { type: 'PRODUCT_VIEW', detail: 'Trailhead Boot — $159.00' },
      { type: 'PRODUCT_VIEW', detail: 'Coastline Sneaker — $89.00' },
      { type: 'PAGE_VIEW', detail: 'browsed /new-arrivals' },
    ],
  },
  {
    id: 'spec-comparer',
    name: 'Spec Comparer',
    description: 'Lines up similar products side by side, studying specs.',
    isReturning: true,
    expectedState: 'COMPARER',
    events: [
      { type: 'REPEAT_VISIT', detail: 'returned via saved tab (2nd session today)' },
      { type: 'PRODUCT_VIEW', detail: 'Pulse Headphones Pro — $199.00' },
      { type: 'PRODUCT_VIEW', detail: 'Pulse Headphones Air — $149.00' },
      { type: 'COMPARE_VIEW', detail: 'compared Pro vs Air (battery, ANC)' },
      { type: 'PRODUCT_VIEW', detail: 'Rival Acoustics Studio — $179.00' },
      { type: 'COMPARE_VIEW', detail: 'compared Pulse Pro vs Rival Studio' },
      { type: 'COMPARE_VIEW', detail: 'compared all three on specs table' },
    ],
  },
  {
    id: 'returning-regular',
    name: 'Returning Regular',
    description: 'Known repeat visitor, beelines to a product and checks out.',
    isReturning: true,
    expectedState: 'LOYAL_CUSTOMER',
    events: [
      { type: 'REPEAT_VISIT', detail: 'logged-in member, 11th visit this quarter' },
      { type: 'PRODUCT_VIEW', detail: 'Daily Roast Coffee Beans — $18.00' },
      { type: 'ADD_TO_CART', detail: 'Daily Roast Coffee Beans x2' },
      { type: 'ADD_TO_CART', detail: 'Oat Milk 6-pack (reorder)' },
      { type: 'CHECKOUT_START', detail: 'used saved card + address' },
    ],
  },
  {
    // Deliberately ambiguous: compares, tries a coupon, then abandons. Labeled
    // CART_ABANDONER (clearest business signal); the rules tend to miss it.
    id: 'torn-shopper',
    name: 'Torn Shopper',
    description: 'Returning, compares options, tries a coupon, then bails at checkout — genuinely mixed.',
    isReturning: true,
    expectedState: 'CART_ABANDONER',
    events: [
      { type: 'REPEAT_VISIT', detail: 'returned via saved-for-later email (2nd session)' },
      { type: 'PRODUCT_VIEW', detail: 'Nimbus 4K Monitor 27" — $329.00' },
      { type: 'PRODUCT_VIEW', detail: 'Nimbus 4K Monitor 32" — $429.00' },
      { type: 'COMPARE_VIEW', detail: 'compared 27" vs 32" (panel, ports, price)' },
      { type: 'COMPARE_VIEW', detail: 'compared Nimbus 32" vs Vertex UltraWide' },
      { type: 'COUPON_ATTEMPT', detail: 'tried code STUDENT10 — rejected' },
      { type: 'ADD_TO_CART', detail: 'Nimbus 4K Monitor 32"' },
      { type: 'CHECKOUT_START', detail: 'entered shipping info' },
      { type: 'CHECKOUT_ABANDON', detail: 'left at payment — hesitated on price' },
    ],
  },
]

// The batch-eval dataset. Presets double as the labeled corpus; keeping them in
// one place means "what you can load" and "what we grade against" never drift.
export const EVAL_SESSIONS = PRESETS
