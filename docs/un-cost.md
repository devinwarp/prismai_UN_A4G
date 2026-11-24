# Cost ledger

Every model call and tool call made to test, evaluate, tune and monitor a use case is recorded, and the approver sees the gross total.

**What is recorded.** `src/lib/llm.ts` counts each model call (model, prompt and completion tokens; failed calls too, as 0 tokens) into the meter that is open around the work (`src/lib/un/cost.ts`). Tool calls the agent makes are counted the same way. Each stage wraps its work in a meter and stores the result with its own record:

| Stage | Where it is stored |
|---|---|
| Test generation | `usage` on the `generated` entry of the generation log |
| Pilot | per run (`usage`, `cost`) and `plan.agent.cost` on the pilot report |
| Goal judging | `usage` on each judgment |
| Tuning | `usage` on each cycle's record in the auto-tuning log |
| Production | `usage` on each monitoring window (the simulated window makes no model calls; real traffic records the same way) |

**What is shown.** `buildLedger` (`cost-ledger.ts`) gathers those records; `loadLedger` reads them. The tuning and production pages show a cost panel; `GET .../release` returns it under `cost`; the approval entry records the gross total at the time of signing.

**Prices.** Tokens are always exact. Dollars come from `data/model-prices.json` (USD per million tokens, filled from the provider's pricing; Bedrock returns tokens only), overridden by `MODEL_PRICES_JSON`. A model with no price is listed under `unpriced` and the total is marked partial. Nothing is estimated; a cost the provider reports itself (OpenRouter) is used as is. Records written before metering carry no usage and add nothing.

**Time.** Each meter also records the wall-clock time it was open (`elapsed_ms`). A pilot's time is the whole pilot; judging and tuning add their per-test or per-cycle times, so for work done concurrently the figure is working time, not elapsed time. Records written before time was recorded show 0s.
