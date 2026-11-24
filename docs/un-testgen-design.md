# AI test-case generator: what exists, and the design of the pilot comparison

## What exists (first slice)

A reasoning agent writes test cases for one task of a job profile from the scenario, its risk, its gates, the skill and SOP lines retrieved from the SOP knowledge base. The expected outcome therefore comes from the SOP, not from our hand-written cases.

- Pure core: `src/lib/un/testgen.ts` (`buildGeneratorPrompt`, `parseGenerated`, `validateCase`, `coverageGaps`, `checkExpectation`, the proposal log). The model call is injected (`ChatFn`).
- Model: `TESTGEN_MODEL`, default `google/gemini-3.5-flash`. The goal judge defaults to `anthropic/claude-sonnet-5.5` (`GOAL_JUDGE_MODEL || CHAT_MODEL`) and the agent under test to `AGENT_LLM_MODEL || CHAT_MODEL`, the same model. A test pins that the default differs in family. The model name is recorded in every case.
- Validation, in code: a scenario with no skill is refused; a case needs at least one citation and every citation must be a chunk id of the SOP knowledge base; gates must be applicable to the scenario; the input must use the agent's own fields and existing fixtures, and a fee task must start from a complete file (so the case can run); an expectation is 1 to 12 machine-checkable assertions; malformed output is dropped and reported; every testable gate (evidence `eval`) must be exercised by a surviving case or it is a coverage gap; the count scales with risk (`RISK_MIN`: base 2, +2 client-facing, +2 rights-affecting, +1 irreversible).
- Storage: `supabase/un-testgen.sql` (`un_testgen_log`, append-only, hash-chained). The existing `un_test_set_log` could not take the proposals because its `kind` check lists the kinds it accepts and `un-test-sets.sql` is not edited. A proposal is accepted by adding it to the test set through the existing `add` path (the set becomes a draft; the approval is the existing approve-and-lock, which names the approver and applies the self-approval rule). Acceptance is read from the test set, so the two logs cannot disagree.
- Route `POST/GET /api/admin/un/use-cases/[id]/testgen`; panel on the tests screen.

An accepted case becomes a test-set entry with `task: null` on purpose (the pilot binds a task's tests to the hand-written cases of that task, so a task here would add duplicate runs of the old cases and inflate the sample) and with a `gen` field: its id in the proposal log, the model, the structured input and the assertions. The pilot runs it through `gen`, not through its task.

## The pilot comparison (built)

1. **The approval covers the case.** `gen` is part of the blueprint, so the approved set's hash covers the input and the assertions: an approved case cannot be changed without breaking the approval (`Blueprint.gen`, `genSpecProblem` in test-sets.ts re-checks its shape on `add`). A blueprint accepted before `gen` existed has none and is listed as not executed; accept the case again to run it.
2. **Binding.** `generatedTaskCase(blueprint)` (pilot-run.ts) turns the input into a `TaskCase` (agent, task, licence, request, docs, prepare, seed, payments with `$CASE` replaced by the case number, ask; an authority case is a probe) whose check is `checkExpectation(gen.expect, result)`. Only the approved set runs, so only approved generated cases do. A case that cannot run (an input the agent refuses, a fixture it lacks) is recorded as disputed with the reason; the pilot goes on.
3. **Result of one run.** `generated: true`, `gen_case`, `disputed` (the result did not meet the expectation) and the `differences`. Never "failed": the expectation may be the wrong one.
4. **Baseline untouched.** `measure()` leaves generated runs out of every baseline measure, so passed/failed, thresholds, the verdict and the baseline numbers are the same with or without generated cases (a test runs the same set both ways and compares). The goal judge is not asked about generated runs.
5. **Report.** A separate "Generated cases" block (`generatedBlock`, shown on the pilot page): per case the repetitions disputed and what differed; how many agree and how many are disputed. It is in the report only when the pilot ran some, so reports without them keep their hashes. No threshold applies to it.
6. **Ruling.** A person with `goals.approve` (the process owner) opens a disputed case and rules `expectation_wrong` or `agent_wrong`, with a reason: one `ruled` entry in `un_testgen_log`, naming the person, once per case and pilot (`planRuling`, route action `rule`). `expectation_wrong` also retires the generated test (a `retired` entry in the test set), so the set must be approved again before the next pilot; the case no longer counts. `agent_wrong` is a confirmed failure.
7. **Release.** A disputed case with no ruling, and one ruled `agent_wrong`, block the release gate (release-gate.ts): see `docs/un-release-gate.md`.

Not built: a confirmed `agent_wrong` does not yet feed the tuning cycle.

## Known limits of the first slice

- Coverage of a gate is by label: a case that names `ai_disclosure` has at least one assertion, but code cannot check the assertion is about disclosure (the task result of T12 has no message body to assert on).
- Expectations are only as good as the SOP lines retrieved; retrieval is BM25 plus the passages the task names.
- One model call per scenario, plus at most ONE repair call (hard cap in code) when cases were rejected or coverage is short: the model sees only its rejected cases with the validator's exact reasons and the gaps, the same validator re-checks the answers, survivors are marked `repaired`. A failed or unreadable repair keeps the first-round result. Cases the validator still rejects are dropped.
