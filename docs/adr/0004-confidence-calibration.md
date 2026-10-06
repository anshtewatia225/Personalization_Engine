# 4. Calibrate confidence instead of trusting magic numbers

Date: 2026-10-06
Status: Accepted

## Context

The rules engine originally derived confidence from a hand-tuned formula
(`45 + dominance*30 + margin*20`) and reconciliation added a flat `+8` boost on
agreement. These constants were guesses, and the LLM's self-reported confidence
was averaged with the rule confidence as if the two scales were comparable.

## Decision

Keep the transparent formula for the live UI, but add an offline evaluation
harness (`npm run eval`) that measures accuracy, per-class precision/recall/F1,
a confusion matrix, and Expected Calibration Error (ECE). Fit isotonic
regression on a training split and apply it to held-out confidence scores.

## Consequences

- **Positive:** confidence now has a measured meaning — a lower post-calibration
  ECE means "80% confident" is closer to "80% correct".
- **Positive:** the harness writes `eval/RESULTS.md`, so claims in the README are
  reproducible rather than asserted.
- **Negative:** synthetic sessions are not real traffic; the generator is
  deliberately noisy but still idealized. Real calibration needs logged outcomes.

## Follow-up

Log prediction outcomes (via the server store) and periodically refit the
calibrator on real data.
