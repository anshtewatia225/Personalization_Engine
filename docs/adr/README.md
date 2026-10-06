# Architecture Decision Records

Short records of the decisions that shaped this project, and the trade-offs
behind them. Written to be readable in ~60 seconds each.

| # | Decision | Status |
| --- | --- | --- |
| [0001](./0001-hybrid-classifier.md) | Hybrid rules engine + LLM instead of LLM-only | Accepted |
| [0002](./0002-independent-classifiers.md) | Keep the two classifiers independent | Accepted |
| [0003](./0003-rules-only-timeline.md) | Rules-only timeline (no LLM per prefix) | Accepted |
| [0004](./0004-confidence-calibration.md) | Calibrate confidence instead of trusting magic numbers | Accepted |
| [0005](./0005-server-side-engine-and-key-proxy.md) | Server-side engine + key-holding API | Accepted |
| [0006](./0006-prompt-taxonomy-rubric.md) | Prompt taxonomy rubric (disambiguating cart abandonment) | Accepted |
