# Writing blind scenarios

Purpose: the built-in scenarios (S1, S2, S4) were written by the people who built the rules, so passing them
is partly circular. Three scenarios written by someone who has not read the rule code are a fairer test.

You do not need to read any code. You need to know what a use case is, which checks ("gates") exist, and what
verdict you would expect a sensible approver to reach at each step. Write the expected verdict from your own
judgement first, then run the file.

## What you decide

A scenario is one use case followed over several steps. At each step some events arrive (a test result, an
incident, a complaint, an owner's statement). You say who receives each event and what verdict you expect
after the step. The harness runs the real agents and policy engine and reports where its verdict differs from yours.
A mismatch is a finding, not a failure on your part: either the engine is wrong or your expectation was.

## File format

A JSON file: `{"scenarios": [ ... ]}`. See `blind-scenarios-example.json` for a complete worked example.

| Field | Where | Meaning |
|---|---|---|
| `id` | scenario | Short unique name, letters, digits, `-`, `_`. Not S1 to S4 or R1 to R5. |
| `title` | scenario | One line. |
| `ext_id` | scenario | Use case id, e.g. `UC99` (fictitious). |
| `client_facing` | scenario | `true` if citizens receive its output. Adds two gates and caps autonomy at GO_SUPERVISED. |
| `requested` | scenario | Autonomy the applicant asks for: `GO_AUTONOMOUS`, `GO_SUPERVISED` or `ASSISTANT_ONLY`. |
| `steps[].step` | step | Name, e.g. `T0`, `T1`. Steps run in order. |
| `steps[].expected` | step | The verdict you expect after this step: `NO_GO`, `ESCALATE`, `ASSISTANT_ONLY`, `GO_SUPERVISED`, `GO_AUTONOMOUS`. |
| `events[].id` | event | Unique across the whole file. |
| `events[].recipients` | event | Who sees it: any of `innovator` (applicant), `policy_adviser`, `security`, `privacy`, `compliance`, `frontline`, `finance`. An agent never sees an event not sent to it. |
| `events[].summary` | event | What happened, in plain words (up to 600 characters). Real text, not a code. |
| `events[].gate` and `events[].status` | event | Optional, together. The gate the event is evidence about and what it shows: `pass`, `fail`, or `fix_declared` (the applicant says it is fixed, not yet re-tested; it must carry `links` to an evidence event id or knowledge-base chunk id, otherwise the engine rejects it and lifts nothing). Leave both out for background context. |

Gates: `approved_infrastructure`, `audit_log`, `data_lawful` (always); `human_final_approval`, `ai_disclosure` (client-facing only);
`hallucination_rate`, `fee_accuracy`, `no_commercial_promotion`, `purpose_limitation` (added when an event about them arrives). Each gate is
owned by one role; send the event to the role you think would own it. Whether a mismatch of owner is handled correctly is part of what is tested.

## Suggested recipe

1. Pick a fictitious use case and decide if it is client-facing.
2. Step 1: some evidence arrives, but not all. What would you say? (Usually ESCALATE: missing evidence.)
3. Later steps: a failure (NO_GO), an owner saying it is fixed (ASSISTANT_ONLY until re-tested), the re-test passing, then your expected final verdict.
4. Write the expected verdict for each step before running anything.
5. Synthetic data only; no real entity names or real people.

## Run it

```
# without a model (rules only), no network:
node scripts/eval_agents.ts --dry --scenarios-file my-scenarios.json --n 1

# with a model, 10 runs per scenario (uses OPENROUTER_API_KEY; costs a few cents per scenario):
node --env-file=.env.local scripts/eval_agents.ts --scenarios-file my-scenarios.json --n 10 --out docs/eval/blind-results
```

The loader checks the file and lists every problem with its location before anything runs. The report shows,
per scenario, how often every step matched your expected verdict, with a 95% interval, and a line
"Steps that missed the expected verdict" naming each step that did not match and in how many runs.

Report mismatches as they are, even if you think your expectation was the wrong one. Do not edit the rules to make a scenario pass.
