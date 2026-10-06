# Shopper Intent Engine

[![CI](https://github.com/anshtewatia225/Personalization_Engine/actions/workflows/ci.yml/badge.svg)](https://github.com/anshtewatia225/Personalization_Engine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Classifies a mock shopper event stream into one of five behavioral states —
**Browser, Comparer, Discount Seeker, Cart Abandoner, Loyal Customer** — with
evidence, a confidence score, and a recommended nudge. A live simulator lets you
load preset sessions or add/delete events and watch the classification update in
real time.

> **Demo / screenshots:** <!-- TODO: add live demo URL + screenshot/GIF here -->

Groq model: `openai/gpt-oss-120b`

## The idea: hybrid, not an LLM wrapper

Two independent classifiers run on every session:

- **A deterministic rule engine** — features are extracted from the event stream
  (coupon attempts, funnel depth, deal-intent searches, etc.), and weighted,
  individually toggleable rules vote on a state with calibrated-by-construction
  confidence. Instant, free, and fully explainable.
- **An LLM second opinion** (Groq / `openai/gpt-oss-120b`) that reads the
  free-text event details — signal the rules are blind to.

A reconciliation layer trusts the rules when they're confident and defers to the
LLM only on ambiguous sessions. Both verdicts and their agreement/disagreement
are always surfaced, because a disagreement is itself the signal for what to
route to human review.

The two run independently (the LLM never sees the rules' verdict or scores) so
agreement means something. The prompt does include a short **taxonomy rubric** —
what each state means and, critically, that `CART_ABANDONER` requires an
abandoned checkout (not merely "added to cart, didn't buy"). That's the problem
spec, not the answer: without it the LLM substitutes its own priors and disagrees
on discount-seeking sessions. See [ADR 0006](./docs/adr/0006-prompt-taxonomy-rubric.md).

## Results

The rule engine is evaluated offline against a reproducible, deliberately noisy
synthetic corpus (440 sessions, 70/30 train/test). Run `npm run eval` to
regenerate [`eval/RESULTS.md`](./eval/RESULTS.md).

| Metric | Value |
| --- | --- |
| Held-out accuracy | **90.9%** |
| Macro F1 | **0.911** |
| ECE (raw confidence) | 0.061 |
| ECE (isotonic-calibrated) | **0.036** |
| Hand-labeled presets (n=6) | 5/6 (83.3%) |

The single preset miss is the deliberately ambiguous **Torn Shopper** (comparing,
coupon-hunting, then abandoning checkout) — included so the evaluation isn't a
rigged 100% and to make the rules-vs-LLM divergence visible.

## Features

- **Live simulator** — presets + add/delete events, re-classifies instantly.
- **Signals tab** — the deterministic features the rules read against.
- **Rules tab** — every rule with its weight and fired status; toggle one and
  watch the vote tally and decision shift.
- **Timeline tab** — per-step classification showing how the shopper moved
  between states across the session.
- **Evaluation tab** — batch accuracy against labeled sessions (rules scored
  instantly, LLM on demand).
- **Recommended actions** — deterministic and templated from real session data
  (product name, failed coupon code), so they're safe to automate; the LLM's
  suggestion stays advisory.

## How it works

```
Browser (Vite + React SPA, Vercel)
  ├── Deterministic path (instant, free, in-browser)
  │     events → extractFeatures → runRules → decide → recommendedAction
  │
  └── LLM path (on demand)
        POST /api/groq/openai/v1/chat/completions
          → Render (Express, holds GROQ_API_KEY)  [prod]
          → Vite dev proxy                        [local]
          → https://api.groq.com
```

The server also exposes the same engine at `POST /api/classify` (see ADR 0005)
so classification can run entirely server-side in production.

## Project structure

```
src/
  constants/presets.js   # event types, states, labeled sessions
  lib/
    features.js          # deterministic signal extraction
    rules.js             # weighted rule engine + scoring
    engine.js            # rules + LLM reconciliation, timeline
    actions.js           # templated, session-aware nudges
    classify.js          # Groq call + prompt (timeout, retries, cost)
    sanitize.js          # prompt-injection guard for event details
    metrics.js           # accuracy / per-class / confusion / ECE
    calibration.js       # isotonic regression
  components/            # UI (panels + tabs)
server/                  # Express API: Groq proxy + server-side engine
  index.js               # routes, CORS, rate limit, metrics, logging
  engine.js  store.js  rateLimit.js  logger.js  openapi.yaml
scripts/eval/            # offline evaluation harness
docs/adr/                # architecture decision records
```

## Run locally

```bash
npm install
cp .env.example .env        # add VITE_GROQ_API_KEY (leave VITE_API_BASE_URL blank)
npm run dev
```

Locally, the Vite dev server proxies `/api/groq` to Groq with your key attached
server-side, so the key never ships to the browser. Get a free key at
https://console.groq.com/keys.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm test` | Vitest unit/component tests |
| `npm run test:coverage` | Coverage report |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run eval` | Offline rule-engine evaluation → `eval/RESULTS.md` |
| `npm run eval:llm` | Optional LLM evaluation (needs `GROQ_API_KEY`) |
| `npm run e2e` | Playwright smoke tests |

Run the server tests separately:

```bash
npm --prefix server install
npm --prefix server test
```

## Deployment

```
Browser → Vercel (static Vite app) → Render (Express API, holds key) → Groq
```

**Backend on Render** — deploy from the repo root (uses the included
[`render.yaml`](./render.yaml), which imports the shared `./src` engine). Set
`GROQ_API_KEY` and `CORS_ORIGIN` (your Vercel origin) in the dashboard. The root
URL returns `{"ok":true}` and `/health` is the probe.

**Frontend on Vercel** — import the repo (auto-detects Vite via `vercel.json`).
Set `VITE_API_BASE_URL` = your Render URL **plus `/api/groq`** (e.g.
`https://your-api.onrender.com/api/groq`, no trailing slash).

Alternatively run the API with Docker:

```bash
GROQ_API_KEY=... docker compose up --build
```

Notes: `VITE_API_BASE_URL` is baked in at build time, so redeploy the frontend
after changing it. Render's free tier sleeps when idle, so the first request
after a pause can take ~30s.

## API

The server is documented in [`server/openapi.yaml`](./server/openapi.yaml):

- `POST /api/groq/openai/v1/chat/completions` — Groq proxy (key attached server-side)
- `POST /api/classify` — deterministic engine, server-side
- `GET /health`, `GET /metrics` — observability

## Design decisions

See [`docs/adr/`](./docs/adr) — hybrid vs LLM-only, independent classifiers,
rules-only timeline, confidence calibration, and the server-side engine/key proxy.

## What I'd do next

- Postgres + Redis instead of JSONL + in-memory rate limiting for multi-instance scale.
- Log real prediction outcomes and periodically refit the confidence calibrator.
- Validate features on a public behavioral dataset, not just synthetic sessions.
- Typed event schemas to replace regex parsing of free-text details.

## License

MIT — see [LICENSE](./LICENSE).
