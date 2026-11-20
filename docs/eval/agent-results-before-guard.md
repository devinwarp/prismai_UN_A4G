# Agent evaluation: first run, before the add-only guard (kept for the record)

Recorded 19 Nov 2026 from the first full run of `npm run eval-agents -- --n 20 --scenarios S1,S2,S4`
(model `anthropic/claude-sonnet-5.5` via OpenRouter, 20 runs per scenario, Wilson 95% CIs, cost about $3.55).
The raw JSON was overwritten by the later run, so these figures are transcribed from that run's report.

Cause: the model could set a gate status the rules had not settled in that turn (for example compliance
failing `hallucination_rate`, privacy failing `data_lawful`), and the engine acted on it. The old guard
only filtered gates that already had a rule message in the same turn. Fixed in `src/lib/un/agents.ts`
(add-only guard) and by parsing prose-plus-fenced-JSON replies with `parseLlmJson`.
The current results are in `agent-results.md`.

| Metric | S1 | S2 | S4 |
|---|---|---|---|
| Path match | 100% (20/20), CI 83.9 to 100 | 0% (0/20), CI 0 to 16.1 | 35% (7/20), CI 18.1 to 56.7 |
| Step match | 100% (100/100) | 66.7% (80/120) | 80% (96/120) |
| Citation exists in `kb/chunks.json` | 100% (287/287) | 100% (200/200) | 100% (256/256) |
| Rejected-message rate | 11.2% (20/179) | 2.0% (3/147) | 26.2% (27/103) |
| Unusable or failed replies | 0% (0/220) | 0% (0/260) | 33.5% (87/260) |
| Accepted messages that added evidence | 32.7% (52/159) | 45.1% (65/144) | 42.1% (32/76) |
