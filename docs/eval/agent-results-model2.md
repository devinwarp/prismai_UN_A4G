# Agent evaluation

Model `google/gemini-3.1-flash-lite` via `https://openrouter.ai/api/v1`.

20 runs per gate scenario, generated 2026-11-20T12:32:25.044Z. S3 is a portfolio scenario with no agents and is not scored.
Intervals are Wilson 95%. Step-level and message-level counts are correlated within a run, so read those intervals as optimistic.

| Metric | S1 | S2 | S4 |
|---|---|---|---|
| Path match (all steps reach the expected outcome) | 100.0% (20/20), 95% CI 83.9% to 100.0% | 100.0% (20/20), 95% CI 83.9% to 100.0% | 100.0% (20/20), 95% CI 83.9% to 100.0% |
| Step match | 100.0% (100/100), 95% CI 96.3% to 100.0% | 100.0% (120/120), 95% CI 96.9% to 100.0% | 100.0% (120/120), 95% CI 96.9% to 100.0% |
| Citation validity (chunk id exists in kb/chunks.json) | 100.0% (234/234), 95% CI 98.4% to 100.0% | 99.5% (189/190), 95% CI 97.1% to 99.9% | 97.6% (245/251), 95% CI 94.9% to 98.9% |
| Citations among the chunks the model was shown | 100.0% (234/234), 95% CI 98.4% to 100.0% | 98.4% (187/190), 95% CI 95.5% to 99.5% | 94.0% (236/251), 95% CI 90.4% to 96.3% |
| Rejected-message rate | 15.0% (31/207), 95% CI 10.8% to 20.5% | 9.9% (23/232), 95% CI 6.7% to 14.4% | 11.7% (25/214), 95% CI 8.0% to 16.7% |
| Model replies that were not usable JSON or failed | 0.0% (0/220), 95% CI 0.0% to 1.7% | 0.4% (1/260), 95% CI 0.1% to 2.1% | 1.2% (3/260), 95% CI 0.4% to 3.3% |
| Model messages proposed per run | 12.80 | 17.80 | 16.10 |
| Dropped by the agent per run (same gate as a rule message) | 2.45 | 6.20 | 5.40 |
| Accepted model messages per run | 8.80 | 10.45 | 9.45 |
| Accepted messages that added evidence (new chunk or event id beyond the rule messages) | 54.0% (95/176), 95% CI 46.6% to 61.2% | 41.6% (87/209), 95% CI 35.2% to 48.4% | 54.0% (102/189), 95% CI 46.9% to 60.9% |
| Tokens per run (in + out) | 13174 | 16846 | 16667 |
| Seconds per run | 18.6 | 24.1 | 25.4 |
| Cost per run (provider usage.cost) | $0.0070 | $0.0091 | $0.0088 |

The verdict comes from the deterministic policy engine, and the model may only add messages to what the rules already established. A path match below 100% therefore means a model message changed the outcome the rules reach, or the scripted expectation is wrong.
