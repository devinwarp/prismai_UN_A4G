# Agent evaluation

Model `anthropic/claude-sonnet-5.5` via `https://openrouter.ai/api/v1`.

20 runs per gate scenario, generated 2026-11-19T19:28:28.623Z. S3 is a portfolio scenario with no agents and is not scored.
Intervals are Wilson 95%. Step-level and message-level counts are correlated within a run, so read those intervals as optimistic.

| Metric | S1 | S2 | S4 |
|---|---|---|---|
| Path match (all steps reach the expected outcome) | 100.0% (20/20), 95% CI 83.9% to 100.0% | 100.0% (20/20), 95% CI 83.9% to 100.0% | 100.0% (20/20), 95% CI 83.9% to 100.0% |
| Step match | 100.0% (100/100), 95% CI 96.3% to 100.0% | 100.0% (120/120), 95% CI 96.9% to 100.0% | 100.0% (120/120), 95% CI 96.9% to 100.0% |
| Citation validity (chunk id exists in kb/chunks.json) | 100.0% (318/318), 95% CI 98.8% to 100.0% | 100.0% (241/241), 95% CI 98.4% to 100.0% | 100.0% (371/371), 95% CI 99.0% to 100.0% |
| Citations among the chunks the model was shown | 95.0% (302/318), 95% CI 92.0% to 96.9% | 98.8% (238/241), 95% CI 96.4% to 99.6% | 95.7% (355/371), 95% CI 93.1% to 97.3% |
| Rejected-message rate | 5.5% (21/379), 95% CI 3.7% to 8.3% | 0.7% (3/426), 95% CI 0.2% to 2.0% | 7.8% (24/308), 95% CI 5.3% to 11.3% |
| Model replies that were not usable JSON or failed | 0.0% (0/220), 95% CI 0.0% to 1.7% | 0.0% (0/260), 95% CI 0.0% to 1.5% | 0.4% (1/260), 95% CI 0.1% to 2.1% |
| Model messages proposed per run | 18.95 | 24.45 | 18.80 |
| Dropped by the agent per run (same gate as a rule message) | 0.00 | 3.15 | 3.40 |
| Accepted model messages per run | 17.90 | 21.15 | 14.20 |
| Accepted messages that added evidence (new chunk or event id beyond the rule messages) | 49.7% (178/358), 95% CI 44.6% to 54.9% | 45.6% (193/423), 95% CI 40.9% to 50.4% | 53.2% (151/284), 95% CI 47.4% to 58.9% |
| Tokens per run (in + out) | 20436 | 26815 | 24367 |
| Seconds per run | 25.1 | 31.1 | 32.7 |
| Cost per run (provider usage.cost) | $0.0626 | $0.0812 | $0.0746 |

The verdict comes from the deterministic policy engine, and the model may only add messages to what the rules already established. A path match below 100% therefore means a model message changed the outcome the rules reach, or the scripted expectation is wrong.
