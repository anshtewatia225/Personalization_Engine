# Shopper Intent Engine — Technical Interview Walkthrough

> One-liner for the interviewer: *"A hybrid shopper-intent classifier: a deterministic weighted rule engine and an LLM second opinion run independently on the same event stream; a reconciliation layer trusts the rules when they're confident and defers to the LLM on ambiguous sessions — with both verdicts always surfaced."*

---

## 1. Architecture Overview

### The big picture

```
Browser (Vite + React SPA, Vercel)
  ├── Deterministic path (runs in-browser, instant, free)
  │     event stream → extractFeatures() → runRules() → decide() → recommendedAction()
  │
  └── LLM path (on demand)
        POST /api/groq/openai/v1/chat/completions
          → Render (Express proxy, holds GROQ_API_KEY)   [prod]
          → Vite dev proxy                                [local dev]
          → https://api.groq.com  (model: openai/gpt-oss-120b)
```

The key design principle: **the two classifiers never see each other.** The LLM prompt contains only raw events; the rule engine only sees extracted features. Independence means agreement between them is a meaningful signal, and disagreement is itself the routing signal for human review.

### Responsibility → file map

| Responsibility | File | Key exports |
|---|---|---|
| App entry | `src/main.jsx` | renders `<App/>` |
| Orchestration & state | `src/App.jsx` | `App` — owns all state, memoized pipeline (src/App.jsx:42-52) |
| Domain constants | `src/constants/presets.js` | `EVENT_TYPES`, `STATES`, `PRESETS`, `EVAL_SESSIONS` (presets double as the labeled eval corpus, presets.js:159) |
| Feature extraction | `src/lib/features.js` | `extractFeatures` (features.js:17), `signalRows` |
| Weighted rule engine | `src/lib/rules.js` | `RULES` (13 rules, rules.js:7-134), `runRules` (rules.js:159), `scoreToDecision` (rules.js:144), `STRONG_CONFIDENCE = 65` (rules.js:136) |
| Reconciliation + timeline | `src/lib/engine.js` | `decide` (engine.js:7), `classifyTimeline` (engine.js:50) |
| LLM call + prompt | `src/lib/classify.js` | `buildPrompt` (classify.js:12), `callLLMClassifier` (classify.js:66), `extractJson`, `validate` |
| Recommended nudges | `src/lib/actions.js` | `recommendedAction` (actions.js:61), `TEMPLATES` |
| UI panels | `src/components/` | `PresetPanel`, `EventStreamPanel`, `DecisionPanel`, `SignalsTab`, `RulesTab`, `TimelineTab`, `EvalTab`, shared `ui/index.jsx` |
| Batch evaluation | `src/components/EvalTab.jsx` | rules scored instantly via `useMemo` (EvalTab.jsx:14-21); LLM scored on demand (EvalTab.jsx:30-42) |
| Key-holding proxy (prod) | `server/index.js` | Express `POST /api/groq/openai/v1/chat/completions` → Groq with `Bearer` key (server/index.js:18-37) |
| Key-holding proxy (dev) | `vite.config.js` | Vite dev proxy `/api/groq` → Groq, attaches key on `proxyReq` (vite.config.js:11-23) |
| Deployment | `vercel.json`, `render.yaml` | Vercel static frontend; Render web service for the proxy |

### How the rule engine decides (the heart of the app)

1. **Features** (`features.js`): count events by type, scan SEARCH/PAGE_VIEW details for `DEAL_KEYWORDS`, compute `funnelDepth` (browse→product→cart→checkout), derive booleans like `abandonedCheckout`, `netCartAdds`.
2. **Rules** (`rules.js`): 13 hand-weighted rules across 5 states (e.g., `coupon-repeat` weight 3 for DISCOUNT_SEEKER, `checkout-abandon` weight 3 for CART_ABANDONER). Each fires against the feature object; weights accumulate per state.
3. **Scoring** (`scoreToDecision`, rules.js:144): winner = highest total. Confidence = `45 + dominance*30 + margin*20`, clamped to [35, 96], where *dominance* = winner's share of all votes and *margin* = lead over runner-up. No rules fired → BROWSER at 30%.
4. **Strength gate**: `isStrong = confidence >= 65 && at least one rule fired` (rules.js:182).

### How reconciliation works (`decide`, engine.js:7)

- **No LLM result**: rules stand alone; low confidence is labeled as such.
- **Agreement**: classification = rules; confidence = avg of both + 8, capped at 98.
- **Disagreement, rules strong (≥65)**: rules win, source = "Rule engine (overrode LLM)".
- **Disagreement, rules weak**: LLM leads, source = "LLM (rules were uncertain)".

---

## 2. End-to-End Request Traces

### Trace A — the LLM second opinion (the full network round trip)

User clicks **"Get LLM second opinion"** in `DecisionPanel.jsx:62`:

1. **`onRunLLM` → `runLLM()`** — `src/App.jsx:90`. Sets `llmLoading`, records `performance.now()` start time.
2. **`callLLMClassifier({ events, isReturning })`** — `src/lib/classify.js:66`.
3. **`buildPrompt(events, isReturning)`** — classify.js:12. Builds a system prompt ("classify into exactly ONE state… respond ONLY with valid JSON") and a user prompt of numbered `[TYPE] detail` lines + session metadata. Note: no state definitions, no rule output — independence by design.
4. **`fetch(`${baseUrl}/openai/v1/chat/completions`)`** — classify.js:71. Body includes `model: openai/gpt-oss-120b`, `temperature: 0.2`, `response_format: { type: 'json_object' }`. `baseUrl` = `VITE_API_BASE_URL` (baked at build) in prod, `/api/groq` in dev.
5. **Production hop: Express proxy** — `server/index.js:18`. Matches `POST /api/groq/openai/v1/chat/completions`, checks `GROQ_API_KEY` exists, re-POSTs the identical body to `https://api.groq.com/openai/v1/chat/completions` with the `Authorization: Bearer` header attached server-side, and passes the upstream status + body straight through (server/index.js:32-33) so the client's error handling still works.
   *(Dev hop instead: `vite.config.js:11` proxies `/api/groq` → `https://api.groq.com`, strips the prefix, sets the header in the `proxyReq` hook — the key never reaches browser JS in either mode.)*
6. **Groq responds** → back through proxy → browser.
7. **Error handling** — classify.js:89-101: non-OK → parse error body; 401 gets a dedicated "check your .env" message.
8. **`extractJson(text)`** — classify.js:28: try `JSON.parse`, fall back to fenced-code-block regex, fall back to first `{` … last `}` slice. Defensive against a model that ignored JSON mode.
9. **`validate(result)`** — classify.js:49: rejects unknown states, clamps confidence to [0,100], truncates evidence to 3 items, defaults missing fields.
10. **Back in `runLLM()`** — App.jsx:96-98: `setLlmResult(res)`, `setLlmLatency(...)`.
11. **Reconciliation** — `decision = useMemo(() => decide(ruleResult, llmResult), ...)` (App.jsx:48 → engine.js:7). The final classification, confidence, source string, and agreement pill re-render in `DecisionPanel`.
12. **Nudge** — `recommendedAction(decision.classification, events, features)` (App.jsx:49 → actions.js:61) fills a state template with session context (product name parsed from the last ADD_TO_CART detail, the failed coupon code regexed out of the last COUPON_ATTEMPT).

**Invalidation rule:** any edit to the stream (add/delete event, toggle returning, load preset) calls `clearLLM()` (App.jsx:55) so a stale LLM opinion can never masquerade as current.

### Trace B — the deterministic path (zero network)

1. User adds an event in `EventStreamPanel` → `onAddEvent` → `addEvent(ev)` (App.jsx:68) → `setEvents`.
2. `features = useMemo(extractFeatures(events, isReturning))` — App.jsx:42 → features.js:17.
3. `ruleResult = useMemo(runRules(features, disabledRuleIds))` — App.jsx:43 → rules.js:159: iterate 13 rules, skip disabled (toggled live in `RulesTab`), accumulate per-state weights, `scoreToDecision`.
4. `timeline = useMemo(classifyTimeline(events, isReturning, disabledRuleIds))` — App.jsx:44 → engine.js:50: re-runs `extractFeatures` + `runRules` on every growing prefix (rules-only, so O(n²) is fine) to show state transitions per step.
5. `decide(ruleResult, null)` → rules-only decision. `recommendedAction` renders. All synchronous, sub-millisecond.

---

## 3. Five Weakest Design Decisions (and what I'd change)

### 1. The eval corpus is 6 hand-labeled sessions that double as the presets
`EVAL_SESSIONS = PRESETS` (presets.js:159) — the same six sessions you demo with are the ground truth, labeled by the same author who wrote the rules. "87% accuracy" over n=6 is not a measurement, it's an anecdote, and there's no holdout, so tuning rules against the eval set is circular.
**Change:** generate a few hundred synthetic sessions with known generation parameters (or sample real/anonymized sessions), split train/holdout, report per-class precision/recall and a confusion matrix — the COMPARER vs DISCOUNT_SEEKER confusion is the interesting number, not raw accuracy.

### 2. The entire rules engine — the business IP — ships to the browser
Rule weights, the 65 confidence threshold, and the nudge strategy are all in the client bundle; a competitor can read them, and changing a weight means a frontend redeploy. Compounding it, the prod proxy (`server/index.js:12`) defaults to `CORS_ORIGIN || '*'` with no auth and no rate limiting — anyone who finds the Render URL can burn the Groq quota.
**Change:** move `features.js`/`rules.js` behind the server (a serverless function or the existing Express app), keep the UI presentational; add rate limiting + an origin allowlist (no `'*'` fallback in prod) + a simple token for the eval runner.

### 3. Feature extraction regex-parses free-text mock details
`DEAL_KEYWORDS` substring matching (features.js:6), `cleanProduct` splitting on `'—'` (actions.js:8), and `couponCode` matching `\b[A-Z][A-Z0-9]{3,}\b` (actions.js:14) all depend on the exact prose in `presets.js`. Real telemetry won't say `"tried code SAVE20 — rejected"`. One locale change or a product named "DEAL" breaks the classifier.
**Change:** define a typed event schema (structured fields: `product_id`, `price`, `coupon_code`, `coupon_result`) and have features read fields, not prose. Keep keyword matching only as an enrichment layer over search strings.

### 4. Confidence is magic numbers end to end, and LLM confidence is treated as commensurable
`45 + dominance*30 + margin*20` (rules.js:154), `STRONG_CONFIDENCE = 65`, the `+8` agreement boost capped at 98 (engine.js:23) are all hand-tuned with zero calibration — and `decide()` averages a rule-engine score with the LLM's *self-reported* confidence, which is a different (and poorly calibrated) scale. The reconciliation policy was never tuned against data.
**Change:** calibrate on labeled data — e.g., logistic regression over rule-vote vector + LLM confidence to learn the blend, or at minimum isotonic/Platt-calibrate both confidence scales before comparing them. Store the discrepancy data for a feedback loop.

### 5. No tests, no persistence, and a stale-response race
There are zero tests for the pure, easily-testable core (`extractFeatures`, `runRules`, `decide` are deterministic functions begging for table-driven tests). Session state lives only in React state — refresh loses everything. And there's a real race in `runLLM`: if the user edits events while a request is in flight, the late response is still committed via `setLlmResult(res)` (App.jsx:97) — `clearLLM()` clears *displayed* state but doesn't cancel or token-guard the in-flight fetch, so a stale LLM opinion can be reconciled against new rules. Also minor drift: README says `llama-3.3-70b-versatile`, the code ships `openai/gpt-oss-120b` (classify.js:8).
**Change:** unit tests for the lib layer (they're pure functions — highest ROI in the codebase), an AbortController/token guard in `runLLM`, localStorage or a session API for persistence, and fix the README model name.

---

## 4. Likely Interview Questions (with answers)

**Q: Why a hybrid rules + LLM design instead of just calling an LLM?**
A: Three reasons. (1) Latency/cost — the rules run in milliseconds for free on every keystroke; the LLM costs a network round trip and is invoked on demand. (2) Explainability/auditability — the rules tab shows exactly which rule fired with which weight and evidence string; you can't put "the model vibes" in an audit log. (3) Determinism — the same event stream always yields the same classification from rules, which matters for automating nudges. The LLM exists specifically for what rules are blind to: free-text signal in event details, and ambiguous sessions where no rule combination is confident.

**Q: Why doesn't the LLM see the rule output or the state definitions?**
A: Independence. If I prompt the LLM toward the rules' answer, agreement becomes circular and meaningless. I actually tested injecting state definitions into the prompt and measured no accuracy lift, so I removed it — the prompt only carries raw events and metadata. Because the two are independent, agreement is real corroboration (I boost confidence) and disagreement is a genuine signal worth surfacing.

**Q: Walk me through how confidence is computed.**
A: Two layers. In the rule engine, weights accumulate per state; the winner's confidence is 45 + dominance×30 + margin×20, where dominance is the winner's share of all votes and margin is its lead over the runner-up, clamped to [35, 96]. Then in reconciliation: if both classifiers agree, I average the two confidences and add 8 (capped at 98) since two independent methods concurring is stronger evidence; if they disagree, the strong-rule gate (confidence ≥ 65 and ≥1 rule fired) decides who leads. I'd flag honestly: these constants are hand-tuned, not calibrated — that's the first thing I'd fix with labeled data.

**Q: Why is the timeline rules-only?**
A: The timeline re-classifies every growing prefix of the session — O(n) runs for an n-event session. With rules that's trivially cheap and instant; with the LLM it would be n network calls and n× the cost. Since the timeline is an explainer UI, rules-only is the right trade-off.

**Q: How do you keep the Groq API key out of the browser?**
A: Two proxies with identical path shapes. In dev, a Vite dev proxy matches `/api/groq/*`, rewrites the path, and attaches the Authorization header in a `proxyReq` hook — the key is read from env server-side and never enters client JS. In prod, the same path is handled by a tiny Express service on Render holding `GROQ_API_KEY`, and the Vercel frontend points at it via `VITE_API_BASE_URL`. Critically, the key env var has no `VITE_` prefix, because anything prefixed `VITE_` gets baked into the bundle at build time.

**Q: What happens if the LLM returns malformed output?**
A: Defense in depth. I request `response_format: json_object` (JSON mode), but I don't trust it: `extractJson` tries plain `JSON.parse`, then a fenced-code-block regex, then a first-`{`-to-last-`}` slice. Then `validate` enforces the schema — unknown classification throws, confidence is clamped to [0,100], evidence truncated to 3, missing fields defaulted. Anything that survives is guaranteed to be safely renderable.

**Q: How do you evaluate this system?**
A: A labeled corpus with an `expectedState` per session. Rules are scored instantly in a `useMemo`; LLM scoring runs on demand, session by session, against the same labels. I deliberately included a "Torn Shopper" — a returning visitor who compares, tries a coupon, then abandons checkout — where the intuitively correct business label (CART_ABANDONER) is exactly what the rules tend to miss, so the eval surface isn't a rigged 100%. I'll also be honest about its weakness: n=6 and the corpus doubles as the demo presets, so it's illustrative, not statistical.

**Q: When rules and the LLM disagree, what should happen in production?**
A: Disagreement is the routing signal for human review — that's why both verdicts are always surfaced instead of only the merged one. Concretely: strong rules + disagree → log it as a rules-vs-LLM discrepancy sample (that's training data for recalibration); weak rules + disagree → LLM leads but tag the output as low-trust so automated actions on it are advisory, not automatic. The recommended actions are deliberately deterministic and templated from real session data (product name, failed coupon code) precisely so the safe subset can be automated.

**Q: How would this scale to real traffic?**
A: The demo classifies one in-memory session; production changes the plumbing, not the concepts. (1) Ingest real events via a queue (Kafka/Kinesis), classify server-side, persist classifications + features. (2) Move the rule engine server-side (it's pure functions — trivial to host) behind an API the site calls. (3) Replace "click for LLM opinion" with an async second-pass on uncertain sessions only — the isStrong gate is already the router. (4) Close the loop: log disagreement and post-click outcomes to recalibrate weights and the blend policy. (5) Nudges become an experiment layer with A/B assignment per state.

**Q: What's the weakest part of the codebase?**
A: Three honest ones. First, the regex-parsing of free-text event details for features and nudge context — it works because I control the mock data, and a typed event schema fixes it. Second, eval rigor — n=6 self-labeled sessions. Third, no tests, even though `extractFeatures`/`runRules`/`decide` are pure functions and table-driven tests would be an afternoon of work with the highest ROI in the repo. Also a known race: an LLM response landing after the user edits the stream isn't token-guarded, so a stale opinion can be committed.

**Q: Why Express on Render instead of serverless functions?**
A: Pragmatism for a demo: one tiny file, free tier, and the CORS/origin story is simple. The trade-off is Render's free tier sleeps — first request after idle can take ~30s, which I surface as LLM latency in the UI. At production scale I'd put the proxy logic in a serverless function at the edge (no cold-start penalty in the same region as the static site) or fold it into the classification API entirely.

**Q: Is there prompt-injection risk?**
A: Yes, by construction — event `detail` strings are user-controlled in a real system and flow verbatim into the prompt. The blast radius is contained because the LLM output is validated against a fixed enum and only ever *advisory* (deterministic templated actions drive automation), but a real deployment would sanitize/escape event text, cap detail length, and treat the whole prompt as untrusted input.

**Q: Why is `isReturning` not derived from the event stream?**
A: It's session metadata (identity/cookie-derived), not a behavioral event — the same reason total event count lives in metadata. The rules consume it as a feature (the LOYAL_CUSTOMER rules require it), and the UI lets you toggle it to see classification flip live.

**Q: What would you build next?**
A: In order: (1) tests for the lib layer, (2) typed event schema replacing prose parsing, (3) server-side rule engine + secured proxy, (4) a real eval set with per-class metrics, (5) calibration of the confidence/reconciliation layer from logged disagreement data.