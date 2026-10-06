# 6. Prompt taxonomy rubric (disambiguating cart abandonment)

Date: 2026-10-06
Status: Accepted

## Context

The LLM prompt originally listed only the five state *names*, deliberately
withholding definitions to keep the two classifiers independent (ADR 0002). The
side effect: the model fell back on its own priors. On the Discount Hunter preset
(two rejected coupons, three deal searches, one add-to-cart, **no checkout
event**) the LLM answered `CART_ABANDONER`, citing "add-to-cart without
subsequent checkout". That is the everyday definition of cart abandonment, but
this taxonomy reserves `CART_ABANDONER` for sessions that explicitly reach
`CHECKOUT_START` and then `CHECKOUT_ABANDON`.

The reconciliation layer caught it (a strong rule verdict overrode the weaker
LLM read), but the LLM was needlessly disagreeing on unambiguous sessions.

## Decision

Include a short **rubric** in the system prompt defining each state and
explicitly stating that `CART_ABANDONER` requires an abandoned checkout — adding
to cart without purchasing is not, by itself, abandonment. Bump the prompt
version to `v3`.

This is the *problem specification*, not the answer. It does **not** include the
rule verdict, per-rule weights, or vote scores, so the classifiers remain
independent and agreement is still meaningful.

## Consequences

- **Positive:** aligns the LLM with the operational taxonomy; removes spurious
  disagreements on discount-seeking and browsing sessions.
- **Positive:** the rule-verdict exclusion is now enforced by a regression test.
- **Negative:** longer system prompt (slightly more tokens per call).
- **Trade-off:** this partly revisits ADR 0002's "state definitions gave no
  accuracy lift" finding. That experiment measured end accuracy; this change is
  about *behavioral* alignment, and the model has since changed to
  `openai/gpt-oss-120b`. A fuller revisit would require scoring the LLM against a
  labeled corpus (`npm run eval:llm`) before and after.
