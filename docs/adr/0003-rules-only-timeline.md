# 3. Rules-only timeline (no LLM per prefix)

Date: 2026-10-06
Status: Accepted

## Context

The Timeline tab shows how the shopper moved between states across the session.
The natural implementation is to re-classify every growing prefix of the event
stream (`events[0..1]`, `events[0..2]`, …).

## Decision

Use the deterministic rules engine — not the LLM — for the timeline.

## Consequences

- **Positive:** an n-event session costs n cheap, synchronous rule evaluations
  (O(n²) in event count, but trivially small in absolute terms). With the LLM it
  would mean n network calls, n times the token cost, and a visibly janky UI.
- **Negative:** the timeline reflects only the rules, so it can diverge from a
  hybrid final verdict. This is acceptable because the timeline is an explainer,
  and the final decision is always shown separately.
