# 2. Keep the two classifiers independent

Date: 2026-10-06
Status: Accepted

## Context

When combining two classifiers, a common trick is to feed the first classifier's
output into the second one's prompt ("here is the rule verdict, confirm or
correct it"). That makes the two agree almost by construction.

## Decision

The LLM prompt contains **only** raw events and session metadata — never the
rule verdict, its scores, or the state definitions. The engine reconciles the
two verdicts *after* both have run independently.

## Consequences

- **Positive:** agreement is real corroboration, so it is safe to boost
  confidence when both agree.
- **Positive:** disagreement is a meaningful signal — it routes ambiguous
  sessions to human review rather than hiding the conflict.
- **Negative:** the LLM occasionally re-derives information the rules already
  knew, which is redundant work on ambiguous sessions.
- **Evidence:** injecting the state definitions into the prompt was tested and
  produced no accuracy lift, so it was removed.
