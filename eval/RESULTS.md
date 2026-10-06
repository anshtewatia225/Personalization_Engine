# Evaluation Results

Generated 440 synthetic sessions (80/class, seed 42, noise 0.3); 308 train / 132 test. Rules are deterministic, so only the test split is scored below.

## Rule engine — held-out test split

- **Accuracy:** 90.9%
- **Macro F1:** 0.911
- **ECE (raw confidence):** 0.061
- **ECE (isotonic-calibrated):** 0.036

### Per-class metrics

| State | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| BROWSER | 22 | 0.913 | 0.955 | 0.933 |
| COMPARER | 20 | 0.714 | 1.000 | 0.833 |
| DISCOUNT_SEEKER | 28 | 0.966 | 1.000 | 0.982 |
| CART_ABANDONER | 36 | 0.964 | 0.750 | 0.844 |
| LOYAL_CUSTOMER | 26 | 1.000 | 0.923 | 0.960 |

### Confusion matrix (rows = expected, cols = predicted)

| expected \ predicted | BROWSER | COMPARER | DISCOUNT_SEEKER | CART_ABANDONER | LOYAL_CUSTOMER |
| --- | ---: | ---: | ---: | ---: | ---: |
| BROWSER | 21 | 0 | 1 | 0 | 0 |
| COMPARER | 0 | 20 | 0 | 0 | 0 |
| DISCOUNT_SEEKER | 0 | 0 | 28 | 0 | 0 |
| CART_ABANDONER | 1 | 8 | 0 | 27 | 0 |
| LOYAL_CUSTOMER | 1 | 0 | 0 | 1 | 24 |

## Hand-labeled preset corpus

- **Accuracy:** 83.3% (5/6)

| Session | Expected | Predicted | Correct |
| --- | --- | --- | :---: |
| Discount Hunter | DISCOUNT_SEEKER | DISCOUNT_SEEKER | ✓ |
| Hesitant Buyer | CART_ABANDONER | CART_ABANDONER | ✓ |
| Window Shopper | BROWSER | BROWSER | ✓ |
| Spec Comparer | COMPARER | COMPARER | ✓ |
| Returning Regular | LOYAL_CUSTOMER | LOYAL_CUSTOMER | ✓ |
| Torn Shopper | CART_ABANDONER | COMPARER | ✗ |

## How to read this

The synthetic corpus is reproducible and deliberately noisy (events are added, dropped, or blended into ~30% of sessions, and ambiguous "torn" sessions are labeled by business priority), so the numbers are an honest signal rather than a rigged 100%. The hand-labeled preset corpus (n=6) is illustrative, not statistical. Isotonic calibration maps the rules' raw confidence onto empirical accuracy; a lower ECE after calibration means "80% confident" is closer to "80% correct".

