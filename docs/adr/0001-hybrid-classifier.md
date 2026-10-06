# 1. Hybrid rules engine + LLM instead of LLM-only

Date: 2026-10-06
Status: Accepted

## Context

The task is to classify a shopper session into one of five behavioral states in
real time and recommend a nudge. A pure LLM approach is simple to build but has
real costs: network latency and API spend on every session, non-deterministic
output, and no explainable audit trail for why a shopper was classified a
certain way.

## Decision

Run a deterministic weighted rules engine on every session, and treat the LLM as
an on-demand *second opinion* rather than the primary classifier. The rules
produce a state, a confidence, and the exact list of rules that fired; the LLM
reads the free-text event details the rules are blind to.

## Consequences

- **Positive:** instant, free, explainable, deterministic primary classification;
  the LLM only runs when explicitly requested.
- **Positive:** the rules tab can show *why* — which rule fired with which weight.
- **Negative:** features must be hand-engineered from the event stream, and rule
  weights need tuning (see ADR 0004).
- **Negative:** the rules are blind to nuance in free-text details, which is
  exactly the gap the LLM covers.
