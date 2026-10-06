// Deterministic synthetic session generator for offline evaluation.
// Each session is labeled with its intended state; noise injects distractor
// events, drops defining events, or blends states, so the classifier genuinely
// confuses some sessions (a rigged 100% would be worthless as an eval signal).

const PRODUCTS = [
  'Nimbus 4K Monitor 32"',
  'Velocity Trainer X',
  'Aurora Standing Desk',
  'Pulse Headphones Pro',
  'Trailhead Boot',
  'Daily Roast Coffee Beans',
  'Summit Down Parka',
]

const CATEGORIES = ['/category/outerwear', '/category/footwear', '/new-arrivals', '/deals']

const DEAL_TERMS = ['discount', 'promo code', 'coupon', 'sale', 'cheap', 'clearance']

// Small deterministic PRNG (mulberry32) so eval runs are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function shuffle(rng, arr) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Each config has a true label and a builder. TORN is deliberately ambiguous:
// it is labeled with the strongest business signal (CART_ABANDONER) even though
// it also compares and coupon-hunts.
const CONFIGS = [
  {
    key: 'BROWSER',
    label: 'BROWSER',
    isReturning: false,
    build(rng, n, maybe) {
      const events = []
      const views = n(3, 6)
      for (let i = 0; i < views; i++) {
        events.push(
          maybe(0.5)
            ? { type: 'PAGE_VIEW', detail: `browsed ${pick(rng, CATEGORIES)}` }
            : { type: 'PRODUCT_VIEW', detail: pick(rng, PRODUCTS) },
        )
      }
      return events
    },
  },
  {
    key: 'COMPARER',
    label: 'COMPARER',
    isReturning: false,
    build(rng, n) {
      const events = [
        { type: 'PRODUCT_VIEW', detail: pick(rng, PRODUCTS) },
        { type: 'PRODUCT_VIEW', detail: pick(rng, PRODUCTS) },
      ]
      for (let i = 0; i < n(2, 3); i++) {
        events.push({ type: 'COMPARE_VIEW', detail: 'compared options on specs' })
      }
      return events
    },
  },
  {
    key: 'DISCOUNT_SEEKER',
    label: 'DISCOUNT_SEEKER',
    isReturning: false,
    build(rng, n, maybe) {
      const events = [
        { type: 'SEARCH', detail: `searched "${pick(rng, PRODUCTS)} ${pick(rng, DEAL_TERMS)}"` },
      ]
      for (let i = 0; i < n(1, 3); i++) {
        events.push({ type: 'COUPON_ATTEMPT', detail: `tried code SAVE${n(10, 99)} — rejected` })
      }
      if (maybe(0.7)) events.push({ type: 'ADD_TO_CART', detail: pick(rng, PRODUCTS) })
      return events
    },
  },
  {
    key: 'CART_ABANDONER',
    label: 'CART_ABANDONER',
    isReturning: false,
    build(rng, n, maybe) {
      const events = [
        { type: 'PRODUCT_VIEW', detail: pick(rng, PRODUCTS) },
        { type: 'ADD_TO_CART', detail: pick(rng, PRODUCTS) },
        { type: 'CHECKOUT_START', detail: 'entered shipping details' },
      ]
      if (maybe(0.5)) events.push({ type: 'PAGE_VIEW', detail: 'viewed shipping & returns policy' })
      events.push({ type: 'CHECKOUT_ABANDON', detail: 'left at payment step' })
      return events
    },
  },
  {
    key: 'LOYAL_CUSTOMER',
    label: 'LOYAL_CUSTOMER',
    isReturning: true,
    build(rng, n, maybe) {
      const events = [{ type: 'REPEAT_VISIT', detail: 'returned via saved tab' }]
      if (maybe(0.7)) events.push({ type: 'PRODUCT_VIEW', detail: pick(rng, PRODUCTS) })
      events.push({ type: 'ADD_TO_CART', detail: pick(rng, PRODUCTS) })
      if (maybe(0.8)) events.push({ type: 'CHECKOUT_START', detail: 'used saved card + address' })
      return events
    },
  },
  {
    key: 'TORN',
    label: 'CART_ABANDONER',
    isReturning: true,
    perClass: 0.5,
    build(rng, n, maybe) {
      const events = [
        { type: 'REPEAT_VISIT', detail: 'returned via saved-for-later email' },
        { type: 'PRODUCT_VIEW', detail: pick(rng, PRODUCTS) },
        { type: 'PRODUCT_VIEW', detail: pick(rng, PRODUCTS) },
      ]
      for (let i = 0; i < n(1, 2); i++) {
        events.push({ type: 'COMPARE_VIEW', detail: 'compared options' })
      }
      if (maybe(0.6)) {
        events.push({ type: 'COUPON_ATTEMPT', detail: 'tried code STUDENT10 — rejected' })
      }
      events.push({ type: 'ADD_TO_CART', detail: pick(rng, PRODUCTS) })
      events.push({ type: 'CHECKOUT_START', detail: 'entered shipping info' })
      events.push({ type: 'CHECKOUT_ABANDON', detail: 'left at payment — hesitated on price' })
      return events
    },
  },
]

export const STATES = [...new Set(CONFIGS.map((c) => c.label))]

function mutate(rng, events) {
  const mode = pick(rng, ['add', 'drop', 'add', 'add'])
  if (mode === 'drop' && events.length > 2) {
    const idx = 1 + Math.floor(rng() * (events.length - 1))
    return events.filter((_, i) => i !== idx)
  }
  const distractor = pick(rng, [
    { type: 'COUPON_ATTEMPT', detail: 'tried code WELCOME10 — rejected' },
    { type: 'COMPARE_VIEW', detail: 'compared two products' },
    { type: 'REMOVE_FROM_CART', detail: 'removed an item' },
    { type: 'SEARCH', detail: 'searched "sale clearance"' },
    { type: 'CHECKOUT_ABANDON', detail: 'left at payment step' },
  ])
  const pos = Math.floor(rng() * (events.length + 1))
  const out = [...events]
  out.splice(pos, 0, distractor)
  return out
}

export function generateDataset({ perClass = 80, seed = 42, noise = 0.3 } = {}) {
  const rng = mulberry32(seed)
  const n = (min, max) => min + Math.floor(rng() * (max - min + 1))
  const maybe = (p) => rng() < p

  const sessions = []
  let id = 0
  for (const config of CONFIGS) {
    const count = Math.round(perClass * (config.perClass ?? 1))
    for (let i = 0; i < count; i++) {
      let events = config.build(rng, n, maybe)
      if (maybe(noise)) events = mutate(rng, events)
      sessions.push({
        id: `${config.key}-${id++}`,
        state: config.label,
        source: config.key,
        isReturning: config.isReturning,
        events,
      })
    }
  }
  return shuffle(rng, sessions)
}

export function trainTestSplit(sessions, { testRatio = 0.3 } = {}) {
  const cut = Math.floor(sessions.length * (1 - testRatio))
  return { train: sessions.slice(0, cut), test: sessions.slice(cut) }
}
