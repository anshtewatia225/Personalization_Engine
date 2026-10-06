// Server-side wrapper around the shared deterministic engine. Importing the
// same pure modules the browser uses keeps the two paths from drifting.

import { extractFeatures } from '../src/lib/features.js'
import { runRules } from '../src/lib/rules.js'

export function classifySession(events, isReturning) {
  const features = extractFeatures(events, isReturning)
  const result = runRules(features)
  return {
    classification: result.classification,
    confidence: result.confidence,
    scores: result.scores,
    firedRules: result.firedRules,
    signals: {
      total: features.total,
      funnelDepth: features.funnelDepth,
      couponAttempts: features.couponAttempts,
      compareViews: features.compareViews,
      abandonedCheckout: features.abandonedCheckout,
    },
  }
}
