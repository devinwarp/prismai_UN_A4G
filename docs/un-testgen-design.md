# AI test-case generator: what exists, and the design of the pilot comparison

## What exists (first slice)

A reasoning agent writes test cases for one task of a job profile from the scenario, its risk, its gates, the skill and SOP lines retrieved from the SOP knowledge base. The expected outcome therefore comes from the SOP, not from our hand-written cases.

- Pure core: `src/lib/un/testgen.ts` (`buildGeneratorPrompt`, `parseGenerated`, `validateCase`, `coverageGaps`, `checkExpectation`, the proposal log). The model call is injected (`ChatFn`).
- Model: `TESTGEN_MODEL`, default `google/gemini-3.5-flash`. The goal judge defaults to `anthropic/claude-sonnet-5.5` (`GOAL_JUDGE_MODEL || CHAT_MODEL`) and the agent under test to `AGENT_LLM_MODEL || CHAT_MODEL`, the same model. A test pins that the default differs in family. The model name is recorded in every case.
- Validation, in code: a scenario with no skill is refused; a case needs at least one citation and every citation must be a chunk id of the SOP knowledge base; gates must be applicable to the scenario; the input must use the agent's own fields and existing fixtures, and a fee task must start from a complete file (so the case can run); an expectation is 1 to 12 machine-checkable assertions; malformed output is dropped and reported; every testable gate (evidence `eval`) must be exercised by a surviving case or it is a coverage gap; the count scales with risk (`RISK_MIN`: base 2, +2 client-facing, +2 rights-affecting, +1 irreversible).
- Storage: `supabase/un-testgen.sql` (`un_testgen_log`, append-only, hash-chained). The existing `un_test_set_log` could not take the proposals because its `kind` check lists the kinds it accepts and `un-test-sets.sql` is not edited. A proposal is accepted by adding it to the test set through the existing `add` path (the set becomes a draft; the approval is the existing approve-and-lock, which names the approver and applies the self-approval rule). Acceptance is read from the test set, so the two logs cannot disagree.
- Route `POST/GET /api/admin/un/use-cases/[id]/testgen`; panel on the tests screen.

An accepted case becomes a test-set entry with `task: null` on purpose. The pilot binds a task's tests to the hand-written cases of that task, so giving it the task would add duplicate runs of the old cases and make the sample look bigger. With no task, the pilot lists it under "not executed" until the comparison below exists.

## Why the comparison is not built yet

Running a generated case is feasible: its input maps one to one onto a `TaskCase` (agent, task, licence, request, docs, prepare, seed, payments, ask), `runCase` takes any `TaskCase`, and `checkExpectation(expect, result)` already turns the expectation into a list of differences. What is not small is everything around it, and it sits in files other work is changing:

1. The set hash must cover the input and the assertions, or an approved case could be changed without breaking the approval. A blueprint has no field for them (only title, expect text, gates, source), so the comparison needs `Blueprint.gen?: { case_id, input, expect, model }` (test-derive.ts, test-sets.ts `add`). The `expect` text of an accepted case already carries the summary and assertions, but the input is not in the hash today.
2. `PilotRun` needs `generated?: true` and `disputed?: boolean`, and `measure()` must leave generated runs out of the baseline measures, so passed/failed, thresholds and the verdict for the old cases do not move. That is a change to pilot.ts, the pilot route and the pilot page.
3. A ruling log and screen.

## Design of the comparison (the next step)

1. Binding. `casesFor` returns, for a blueprint with `gen`, the case built by `generatedTaskCase(gen)`: `check: (r) => checkExpectation(gen.expect, r)`; payments with `reference: "$CASE"` get the case number. The route passes the approved set only, so only approved generated cases run.
2. Result of one run. `agrees` (actual meets the expectation) or `disputed` (it does not). Never `failed`: the expectation may be the wrong one. The run records the list of differences from `checkExpectation`.
3. Report. The existing block (passed, failed, thresholds, verdict) is computed from the old cases only and is labelled "baseline: hand-written cases". A second block, "Generated cases", shows agrees, disputed and not executed, separately. No threshold applies to it until the owners choose one.
4. Ruling. A reviewer with `goals.approve` (process owner) opens a disputed case and rules `expectation_wrong` or `agent_wrong`, with a reason. It is one `ruled` entry in `un_testgen_log` (kind already allowed by the SQL): `{case_id, pilot_id, ruling, reason}`, naming the person. `expectation_wrong` retires the generated test (a `retired` entry in the test set) and the case is not counted against the agent. `agent_wrong` counts as a real failure in a labelled "generated, confirmed" count and feeds tuning.
5. Order of work: the `gen` field and its hash; `generatedTaskCase`; the `generated`/`disputed` fields and the measure filter; the route; the report block; the ruling route and screen. Each step keeps the old pilot's numbers identical, which a test can check by running the same set with and without generated cases.

## Known limits of the first slice

- Coverage of a gate is by label: a case that names `ai_disclosure` has at least one assertion, but code cannot check the assertion is about disclosure (the task result of T12 has no message body to assert on).
- Expectations are only as good as the SOP lines retrieved; retrieval is BM25 plus the passages the task names.
- One model call per scenario, plus at most ONE repair call (hard cap in code) when cases were rejected or coverage is short: the model sees only its rejected cases with the validator's exact reasons and the gaps, the same validator re-checks the answers, survivors are marked `repaired`. A failed or unreadable repair keeps the first-round result. Cases the validator still rejects are dropped.
