# 5. Server-side engine + key-holding API

Date: 2026-10-06
Status: Accepted

## Context

Two problems with an all-in-browser design: (a) the Groq API key would ship to
the client, where anyone can read it, and (b) the rule weights, thresholds, and
nudge strategy — the actual business logic — live in the JS bundle, readable by
competitors and only changeable via a frontend redeploy.

## Decision

Deploy a small Express service that (1) proxies Groq with the key attached
server-side, and (2) exposes `POST /api/classify`, running the *same shared pure
modules* the browser imports. The client keeps its local instant classification
for a snappy UI; the server endpoint is the production integration path.

## Consequences

- **Positive:** the key never reaches the browser; the business logic can live
  server-side and change without a frontend deploy.
- **Positive:** the server adds rate limiting, CORS allowlisting, request-size
  caps, upstream timeouts, structured logs, metrics, and file-based persistence
  for a future feedback loop.
- **Negative:** two deploy targets (Vercel + Render) and a shared-source import
  path (`server/` imports `../src/`) that the deploy config must respect.
- **Trade-off:** in-memory rate limiting and JSONL persistence are per-instance
  and low-scale; Postgres + Redis are the next step.
