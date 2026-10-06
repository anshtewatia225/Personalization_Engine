// In-memory sliding-window rate limiter, keyed by client IP. No external store,
// so it is per-instance; swap for Redis/Upstash when running multiple replicas.

export function createRateLimiter({ windowMs = 60_000, max = 120, now = Date.now } = {}) {
  const hits = new Map()

  return function rateLimit(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown'
    const t = now()
    const recent = (hits.get(key) || []).filter((ts) => t - ts < windowMs)

    if (recent.length >= max) {
      const retryAfter = Math.ceil(windowMs / 1000)
      res.set('Retry-After', String(retryAfter))
      res.set('X-RateLimit-Limit', String(max))
      res.set('X-RateLimit-Remaining', '0')
      return res.status(429).json({ error: { message: 'Too many requests. Slow down.' } })
    }

    recent.push(t)
    hits.set(key, recent)
    res.set('X-RateLimit-Limit', String(max))
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - recent.length)))
    return next()
  }
}
