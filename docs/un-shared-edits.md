# Shared-file edits (gates and governance as data)

New code lives in `src/lib/un/gates*.ts`, `src/lib/un/governance.ts`, `src/app/admin/federal/gates/`, `data/un-governance.json`, `supabase/un-gates.sql`. Edits to existing files:

- `src/lib/un/policy.ts`: `GATES` now seeded from `data/un-governance.json`; `GateId` is `string`; `decide()` gains optional `catalog`, `useCaseGates`, `waived` (old calls unchanged); `applicableGates` gains optional `catalog`.
- `src/lib/un/rulesets.ts`: the three rule sets are seeded from the same file.
- `src/lib/un/protocol.ts`, `round.ts`, `scenario.ts`, `trace.ts`: optional added/waived gates on `CaseState`, `RunEnv.effective`, `effective_gates` on verdict trace records (only when a use case adds or waives gates, so existing logs and hashes are unchanged).
- `src/lib/un/compare.ts`, `src/app/admin/federal/compare/page.tsx`: "N gates added" per process.
- `src/app/admin/federal/page.tsx`, `FederalPanel.tsx`: "N gates added" on the dashboard; link to the gates page.
- `src/app/admin/federal/use-cases/[id]/page.tsx`: gates section.
- `src/app/admin/federal/_components/ui.tsx`: `Section` eyebrow/title accept nodes.
- `src/app/api/admin/un/runs/[id]/route.ts`, `runs/[id]/adhoc/route.ts`: pass the effective gates into the run.
- `src/app/api/admin/un/use-cases/[id]/tuning/approve/route.ts`: approval also needs every effective gate to pass when the use case has added gates.
- `src/lib/un/i18n/dict.ts`: spreads `gates-ar.ts`.
- `src/lib/supabase/offline.ts`: minimal `like()` so the use-case page loads offline.
# Shared-file edits (journey bar and job profiles)

- `src/app/admin/federal/use-cases/[id]/{page,evals/page,tuning/page,production/page}.tsx`: AdminHeader and the page wrapper moved into the new `layout.tsx` (which adds the journey bar); the redundant evals/tuning text links on `page.tsx` removed.
- `src/app/admin/federal/_components/Lang.tsx`: one line, fires a `prism-un-lang` event so the bar (outside the page's LangShell) follows the language toggle.
- `src/app/admin/federal/FederalPanel.tsx`, `federal/page.tsx`, `federal/evals/page.tsx`: compact journey line (new Journey column and prop).
- `src/app/admin/federal/sop/{page,SopWorkbench}.tsx`: attach SOP-LIC-014 to UC02.
- `src/lib/un/i18n/dict.ts`: spreads `JOURNEY_AR`.
- `src/lib/un/sop/{data,reference}.ts`, `data/sop-baseline.json`: SOP-LIC-014 as a fourth sample (Annex excluded); `flagsOfText` export and the cue "tell".
- `scripts/extract_skill.ts`: now calls `src/lib/un/skill-extract.ts`.
- `tests/un-sop.test.ts`: four samples.
- New SQL: `supabase/un-profiles.sql` (applied to the hackathon Supabase project on 21 Nov 2026; not yet exercised by the app).
# Edits to shared files (tuning workstream)

New code lives in `src/lib/un/` (react-config, tuning-bank, tuning-fix, tuning-versions, tuning-service, kb-store*), `src/app/admin/federal/tuning/`, `src/app/api/admin/un/tuning/`, `supabase/un-sop-kb.sql` and `docs/sop-kb-hosting.md`. Edits to files that already existed:

- `src/lib/un/react-sop.ts`: glossary, routing and thresholds read from a `ReactConfig` (default reproduces the old constants); `ruleReasoner` kept, `makeRuleReasoner` added; `ReactOptions.config`.
- `src/lib/un/sop-rules.ts`: `loadRules` takes an optional config.
- `src/lib/un/analyst-agent.ts`: `Tools.react`, `OpenOptions.skillRules` (rule lines appended to the skill after extraction).
- `src/lib/un/task-evals.ts`: `EvalEnv.react` and `EvalEnv.skillRules`.
- `src/lib/un/i18n/dict.ts`: spreads `TUNING_AR` (draft Arabic).
- `src/app/admin/federal/FederalPanel.tsx`: one entry in `GO` linking the tuning screen.
- `src/app/admin/federal/use-cases/[id]/tuning/page.tsx`: a "real agent" section for UC02.
# Edits to shared files (gate approvers and sample cleanup)

New: `src/lib/un/approvers.ts` (the pure approver rules), `src/lib/un/approvers-store.ts` (looks up a use case's approvers from its attached SOP), `tests/un-approvers.test.ts`, `tests/helpers-sop-fixture.ts`, `tests/fixtures/sop/analyzer-licence-renewal.md` (moved from `data/sop/`).

Files that existed before and were edited:
- `src/lib/un/gates.ts`: gate-log entries carry `approver` and `approver_source`; `acceptanceOf` treats a gate added to a use case with no approver as unsigned.
- `src/app/api/admin/un/gates/route.ts` and `src/app/api/admin/un/use-cases/[id]/gates/route.ts`: an approver is required and must be on the allowed list, never free text. A waiver's approver is the same kind of selection. Org-wide catalogue changes are approved by a governance role; there is no process owner to default to.
- `src/app/admin/federal/gates/GateForm.tsx`, `src/app/admin/federal/gates/page.tsx`, `src/app/admin/federal/use-cases/[id]/GateActions.tsx`, `UseCaseGates.tsx` and `page.tsx`, `src/lib/un/i18n/gates-ar.ts`: approver selection and display, with draft Arabic for the new strings.
- `src/lib/supabase/offline.ts`: `path.resolve` instead of `path.join`, so an absolute `OFFLINE_DB` (the tests use a temp folder) works on Windows. This fixed the test "ticks persist in the offline store and a re-tick updates the same row" on Windows.
- `src/lib/un/sop/data.ts`: the older `licence-renewal` sample is no longer offered, because it described the same process as SOP-LIC-014. SOP-LIC-014 is now first in the list, so it is the default on the intake page. The old text moved to `tests/fixtures/sop/` and only the analyzer tests use it. This supersedes the "fourth sample" and "four samples" lines above: the product has three samples, and `tests/un-sop.test.ts` runs on those three plus the fixture.
- `tests/un-sop.test.ts`, `tests/un-profiles.test.ts`, `tests/un-wiring.test.ts`: retargeted to the fixture, and the shared added-gate fixture now carries an approver.
- `data/sop-baseline.json` still has a `licence-renewal` volume entry; only the fixture uses it.

# Edits to shared files (agent-runtime area)

Files that existed before the agent-runtime work and were edited. Everything else is new.

- `src/lib/un/i18n/dict.ts`: imports and spreads `AGENT_RUNTIME_AR` (two lines).
- `src/app/admin/federal/FederalPanel.tsx`: one entry in the `GO` list linking to `/admin/federal/outside`.
- `src/app/admin/federal/use-cases/[id]/evals/page.tsx` and `.../production/page.tsx`: render `AgentRuntimePanel` for use cases that have an SOP-driven agent (UC02).
- `src/lib/un/react-sop.ts`, `analyst-agent.ts`, `doc-ocr.ts`, `case-memory.ts`, `sop-rules.ts`, `task-evals.ts`, `fixtures-uc02.ts`, `scripts/make_synthetic_docs.ts` (agent-runtime code written by the earlier branch, extended here).
- `data/sops/fixtures/uc02/docs/ocr-cache.json`: new entries for the new synthetic images (existing entries untouched).

New migration: `supabase/un-outside-queue.sql` (applied to the hackathon Supabase project on 21 Nov 2026). `supabase/schema.sql` is untouched.

# Edits to shared files (country and knowledge base)

New code lives in `src/lib/un/country*.ts`, `src/lib/un/i18n/country-ar.ts` (draft Arabic), `src/app/admin/federal/country/`, `src/app/api/admin/un/country/`, `data/un-countries.json`, `data/sops/sg-mbla-licence-renewal-sop.md` (synthetic company SOP), `kb/stage/eu/` (pre-fetched EU AI Act text with a manifest), `scripts/embed_new_chunks.ts`, `supabase/un-country.sql` (new tables, NOT applied to any database) and `tests/un-country.test.ts`. Edits to files that already existed:

- `src/lib/un/kb.ts`: `SearchOpts.home` (which jurisdictions `mix` treats as home; default UAE-federal and Dubai, so every existing call is unchanged) and `warmIndex()` (builds and sizes the BM25 index).
- `src/lib/un/vector.ts`: the embedder loader is now `getEmbedder()`, shared by `embedQuery` (unchanged behaviour) and the new `embedDocuments()` (document prefix, used by the live build).
- `src/lib/un/protocol.ts`: optional `CaseState.ruleset`, passed to `decide()` in `reconcile`. Absent = today's behaviour. The policy engine itself (`policy.ts`) is not edited.
- `src/lib/un/scenario.ts`: optional `RunEnv.ruleset` and `RunEnv.home`; the ruleset is never stored on a run's state.
- `src/lib/un/trace.ts`: a verdict record carries `ruleset` only when the run was judged under one (country re-runs); older logs and hashes are unchanged.
- `data/un-governance.json`: the Singapore rule set now cites the new Singapore chunks (PDPA, MGF) for its gates; the encoding (gates, thresholds) is unchanged.
- `kb/sources.json`, `kb/chunks.json`, `kb/sources.lock.json`, `kb/vectors.json`: 8 Singapore excerpt sources appended (59 chunks); the first 398 chunks and vectors are untouched. `public/replay/backup-run.json` regenerated (the recorded replay reads the whole corpus; verdicts unchanged, citations and head hashes of S1, S2, S4 changed).
- `src/lib/un/i18n/dict.ts` (spreads `COUNTRY_AR`), `src/app/admin/federal/FederalPanel.tsx` (one entry in `GO`), `src/lib/un/landing/copy.ts` (source and passage counts), `README.md`, `docs/RETRIEVAL_NOTE.md`, `tests/un-guard.test.ts` (the list of excerpt-only sources).

# Edits to shared files (Arabic gaps and multilingual note)

New code: `src/lib/un/i18n/ui-a-ar.ts`, `ui-b-ar.ts`, `ui-c-ar.ts` (draft Arabic, not native-reviewed), `src/lib/un/query-gloss.ts` (offline Arabic query keywords), `src/app/admin/HeaderLang.tsx`, `src/app/admin/federal/_components/{b-bits,labels,Deadline,VerdictBadge}`, `src/app/replay/ReplayView.tsx`, `tests/un-i18n-parity.test.ts`, `docs/multilingual-note.md`. Edits to files that already existed:

- `src/app/admin/AdminHeader.tsx`: the header row follows the stored language (direction, the "Federal" label); `ml-1` became `ms-1`.
- `src/app/login/LoginClient.tsx`: the "English" toggle label carries `lang="en"`, other chrome translated.
- `src/app/replay/page.tsx`: now renders `ReplayView.tsx` (language toggle and Arabic chrome); `tests/un-small.test.ts` reads `ReplayView.tsx` for the sandbox-label check.
- `src/app/api/admin/un/kb/route.ts` and `src/app/api/admin/un/outside/ask/route.ts`: Arabic query translation (model, else glossary); the responses add `query_translated_via`. `src/lib/un/query-translate.ts`: glossary fallback; `tests/un-query-translate.test.ts`: one example changed ("تظلم" now has a glossary match), one test added.
- `src/lib/un/i18n/dict.ts` (spreads the three new files), `src/lib/un/i18n/journey-ar.ts` (`nav.federal`; `pf.tasks` now keeps its `{n}`).
- Federal screens (translation of chrome only, English output unchanged): `FederalPanel.tsx`, `HitlEditor.tsx`, `page.tsx`, compare, country, evals, gaps, gates, kb, outside, scenarios, sop, runs, use-case pages, `_components/{Chain,CitizenMessageCheck,ImportCsv,charts,ui}.tsx`.
- `docs/accessibility-check.md`: regenerated by `npm run a11y`.

Small-fix pass (all inside UN folders; no other shared file touched): `src/lib/un/i18n/dict.ts` gains `trN` (count-aware wording) and `Lang.tsx`'s `TV` takes an optional `one`; `src/app/api/admin/un/country/route.ts` passes the organisation to `resetDemo` (a no-op reset logs nothing); `src/lib/un/sop/reference.ts` rights/irreversible cues refined (limits on authority are not rights cues; "cannot be withdrawn" is irreversible); `src/lib/un/query-gloss.ts` glossary additions; tests now keep scratch files in the OS temp dir.

# Edits to shared files (roles and permissions)

New: `src/lib/un/authz.ts` (roles, actions, scope, `can()`; pure), `src/lib/un/roles-store.ts` (reads `un_role_assignments`), `src/lib/un/permissions-server.ts` (the same check for server pages), `supabase/un-roles.sql` (**written, not applied**), `tests/un-authz.test.ts`.

Behaviour: a stored `admin` still holds every role, so nothing changes for admins; a `viewer` can only read (a test checks that for every action in the table). Roles can be held for the whole organisation or for one use case. Which person holds a job title comes from `profiles.job_title` (the minimum org chart). In offline mode `OFFLINE_ROLE` accepts a role id (`process_owner`, `operator`, `test_author`, `governance_admin`, `viewer`) as a demo persona.

Files that existed before and were edited:
- `src/lib/api-auth.ts`: adds `requirePermission(action(s), { useCaseId })`, `forbidden()` and the `Authorised` caller with `decide(action)`. `requireAdmin` is unchanged.
- Routes now on `requirePermission` (the permission is checked before any state is looked at): `gates` (`gate.catalogue.change`), `use-cases/[id]/gates` (`gate.add`, `gate.waive`), `use-cases/[id]/tuning/approve` (`tuning.approve`), `use-cases/[id]/tuning` POST and `use-cases/[id]/eval` POST (`tuning.run`), `use-cases/[id]/watchdog` POST (`deploy`, `watchdog.window`, `reinstate`). Reset (DELETE) routes and every other route still use `requireAdmin`.
- Pages that show a control only to someone the route would accept: `gates/page.tsx`, `use-cases/[id]/page.tsx` (gates panel), `.../tuning/page.tsx`, `.../production/page.tsx`, `.../evals/page.tsx`; `TuningControls.tsx` and `ProductionControls.tsx` take a `canReset` prop so the reset button is shown only to an admin.
- `tests/un-judge.test.ts`, `tests/un-gates.test.ts`: the static "every mutating route has a guard" checks accept `requirePermission(` as well as `requireAdmin()`.

Not done: assigning roles (no screen yet), separation of duties in the routes (the helper exists), the remaining routes, the run-sign route (it is keyed by run id, not use case).

# Edits to shared files (tests derived from the skill)

New only: `src/lib/un/test-derive.ts` (pure), `scripts/derive_tests.ts`, `tests/un-test-derive.test.ts`. No existing file is edited here; the test-set log below builds on it.

`deriveTests()` turns the SOP chunks a skill is built from into the required test blueprints for a job profile: a normal case per task, one test per "Problems" line, a boundary test per numeric rule, a refusal per task of another profile, one per SOP control, three outside-the-SOP questions, nine non-functional measures, and for each client-facing task the scenario families that apply. `coverage()` and `approvable()` say what a set still lacks: a required slot must be covered by an active test, or retired with a named waiver, and a client-facing task cannot drop below six scenarios. These are specifications for a process owner to review; they are not yet executable and not linked to the 117 hand-written eval cases, so the comparison in `scripts/derive_tests.ts` is by count.

# Edits to shared files (the test set: log, approval, route)

New: `src/lib/un/test-sets.ts` (the hash-chained log and its rules; pure), `src/lib/un/test-set-store.ts` (reads and appends the log, derives the requirements for a profile), `src/app/api/admin/un/use-cases/[id]/tests/route.ts`, `supabase/un-test-sets.sql` (**written, not applied**), `tests/un-test-sets.test.ts`.

What it does: one log per use case and job profile. It starts as the tests derived from the skill; the process owner adds, edits and retires ("delete" means retire: the entry stays); a version is approved at the hash of the whole set, and any later change makes it a draft again. A set can be approved only when every required slot is covered, and the person who changed it cannot approve it unless they state why (logged). The approver and a waiver's approver are chosen from the use case's list (see approvers.ts). The route needs the profile to be ticked Automate. A stored entry that is edited is detected: the route reports the chain broken and refuses further changes.

Files that existed before and were edited: `src/lib/un/authz.ts` (`scenario.edit` and `scenario.approve` are now wired; `scenario.propose` is not), `tests/un-authz.test.ts` (the "wired actions" test ignores `view`).

Not done: a screen for the editor (the route is the only way in today), linking tests to runs, the verdict parameters, and running the pilot. The role `test_author` cannot yet propose changes.

# Edits to shared files (verdict parameters)

New only: `src/lib/un/verdict-params.ts` (the thresholds, the governance floors, the log and its rules; pure), `src/lib/un/verdict-param-store.ts`, `src/app/api/admin/un/use-cases/[id]/params/route.ts`, `supabase/un-verdict-params.sql` (**written, not applied**), `tests/un-verdict-params.test.ts`. No existing file is edited.

What it does: the thresholds a pilot is judged against (accuracy lower bound, alignment on controls and on goals, hallucination, rejected calls, refusal, consistency, audit completeness, client-facing compliance, optional latency and cost ceilings, how often each test is repeated and the smallest sample per task). The process owner proposes them; they cannot be looser than the governance floors in `FLOORS` (checked when proposed and again when approved); they are approved and locked at a hash, and the proposer cannot approve without a stated, logged reason. A proposal never changes what is approved until it is approved itself. A pilot run will record the hash it ran under, so a threshold cannot be moved after the results are seen. The default values are illustrative; the owner must set and approve them.

Uses the same permissions as the test set (`scenario.edit` to propose, `scenario.approve` to approve or withdraw). The parameters are per job profile, like the test set; whether they should be per use case is an open decision.

Not done: a screen, and the pilot run that applies them.

# Edits to shared files (the pilot engine)

New only: `src/lib/un/pilot.ts` (pure) and `tests/un-pilot.test.ts`. No existing file is edited.

`measure()` turns a list of `PilotRun` records (one per repetition of each approved test: did it match the expected output, the answer, latency, cost, hallucination, controls and goals, refusal, logging, Sijil rejections, client-facing checks) into measures. `judge()` compares them with the approved parameters (verdict-params.ts) and says whether the sample is large enough (the smallest number of tests per task of the profile, and of repetitions per test). `measuredGates()` turns the measures into evidence for the gates that rest on evals or Sijil: `ai_disclosure`, `hallucination_rate`, `fee_accuracy`, `no_commercial_promotion`, `audit_log`. Gates that rest on a reviewer are left as the reviewer set them. `pilotVerdict()` asks `decideEffective()` for the verdict; `buildReport()` binds the result to the approved test set hash and parameters hash.

Rules: accuracy uses a lower confidence bound (30 of 30 is not enough at the default threshold); hallucination uses the observed rate; client-facing compliance is zero tolerance; a threshold with nothing measured fails; a set ceiling that could not be measured fails; an inconclusive pilot never passes a gate (its measured gates stay unknown, so the verdict is ESCALATE), though a failure is still a failure.

Not done, and why it matters: nothing produces `PilotRun` records from the real agent yet. The 117 hand-written eval cases are not linked to the test blueprints, they have no measure of goal alignment (so `alignment_goals` would be "not measured", which fails), and they do not record whether each run was logged. All the tests of this module use synthetic runs and say nothing about any agent.

# Edits to shared files (the tests and parameters screen)

New: `src/app/admin/federal/use-cases/[id]/tests/page.tsx` and `TestSetEditor.tsx`, `src/lib/un/i18n/tests-ar.ts` (Arabic, draft for a native speaker). Edited: `src/lib/un/i18n/dict.ts` (spreads `TESTS_AR`) and `use-cases/[id]/sop/page.tsx` (one link to the new screen).

The screen shows, per job profile ticked Automate: the test set (coverage, gaps that block approval, active and retired tests, add a scenario, edit a title, retire with an optional named waiver, restore, approve with an approver chosen from the use case's list, withdraw) and the verdict parameters (propose, governance floor beside each value, approve, withdraw). Controls appear by `scenario.edit` and `scenario.approve`, the same checks the routes make; whoever changed the set or the proposal must state why before approving it. Verified against a production build with a scratch offline database: create, approve and lock, propose and approve parameters, Arabic and right-to-left layout.

Not on the screen yet: editing a test's expected result or scenario (the route allows it), the version and change history, and the pilot run itself.

# Edits to shared files (the pilot runner)

New only: `src/lib/un/pilot-run.ts`, `tests/un-pilot-run.test.ts`. No existing file is edited.

`planPilot()` binds each active test to the real agent's hand-written cases (task-evals.ts) by task and kind: normal cases for happy_path, holdout cases for exception and boundary, authority probes for authority. A test with no executable case (all client-facing tests, and tasks with no case) is listed in `unexecuted` and never given a result. `executePilot()` runs every bound case `reps` times and `toPilotRun()` records one `PilotRun` each (latency from the clock, answer digest for consistency, refusals, logging, Sijil rejections). Goal alignment and cost are left null, so `alignment_goals` still reads "not measured". The binding is a heuristic: it is recorded in each run's `test_id` (`blueprint#case`) so a reviewer can see it.

Not done: a route or screen that runs it and stores the report, executable client-facing cases, a rubric for goal alignment.

# Edits to shared files (the pilot route and screen)

New: `src/app/api/admin/un/use-cases/[id]/pilot/route.ts`, `src/lib/un/pilot-store.ts`, `supabase/un-pilot-reports.sql` (**written, not applied**), `src/app/admin/federal/use-cases/[id]/pilot/page.tsx` and `PilotControls.tsx`, `src/lib/un/i18n/pilot-ar.ts` (Arabic draft). Edited: `authz.ts` (`pilot.run` now wired), `i18n/dict.ts`, `i18n/tests-ar.ts` and `tests/page.tsx` (a link to the pilot screen).

`POST /api/admin/un/use-cases/[id]/pilot {profile}` needs `pilot.run`. It refuses (409) unless the SOP is SOP-LIC-014 (the only SOP with executable cases), the test set is approved and unchanged since, the verdict parameters are approved, and both logs verify. It then runs the approved tests on the real agent, `min_runs_per_test` times each, builds the report and stores it with the hashes of the test set and the parameters. `GET ?profile` lists the stored reports.

Verified over HTTP on a production build: refused with no test set, with an unapproved set and with unapproved parameters; ran after both were approved (534 runs, 39 tests not executable, inconclusive, ESCALATE); the screen shows the findings, why the sample is short, the tests that could not run, and the reasons.

Limits to know: the verdict rests on measured gates only (reviewer gates are passed as unknown, so it cannot reach GO until they are recorded here); client-facing, control and outside-the-SOP tests and most authority tests have no executable case and are listed as such, so goal alignment and client-facing compliance read "not measured" and fail; a pilot cannot be conclusive until those exist. The pilot runs inside the request (a few seconds here), which will need a background job for a slower, model-backed agent.

# Edits to shared files (authority and outside-the-SOP tests now execute)

Edited: `src/lib/un/pilot-run.ts` (adds `generatedCases()`, a `role` for binding), `src/lib/un/test-derive.ts` (exports `OUTSIDE`, the three outside questions), the pilot route (runs the generated cases too), `tests/un-pilot-run.test.ts`.

Authority tests: every authority test of the profile gets a probe, the agent of that role is asked to run a task that is not its own, and must refuse and name the owner (a hand-written probe for the same task and role is used instead when there is one). Probes of other roles are no longer bound to this profile's tests. Outside-the-SOP tests: the question the test names is asked, and the run passes only if it ends in the outside-information call (`status: outside_kb`). On the Document Verification Analyst's set, all authority and outside tests now execute and the agent passes them.

Still not executable, and reported as such: the seven SOP controls, the client-facing scenarios, the non-functional tests as separate tests (their measures come from every run). Goal alignment still reads "not measured".

# Edits to shared files (goal alignment: judged by a model, approved by a person)

New: `src/lib/un/goal-judge.ts` (pure), `src/app/api/admin/un/use-cases/[id]/pilot/goals/route.ts`, `src/app/admin/federal/use-cases/[id]/pilot/GoalReview.tsx`, `tests/un-goal-judge.test.ts`. Edited: `pilot-store.ts` (stores every run, a report's basis, and the goal-review log), `supabase/un-pilot-reports.sql` (**written, not applied**: adds `run_records`, `basis` and `un_goal_review_log`), `authz.ts` (new action `goals.approve`, process owner; `pilot.run` also covers having the model judge), `pilot.ts` (a run carries a short `summary`), `pilot-run.ts`, the pilot route (returns `pilot_id`), the pilot page, `i18n/pilot-ar.ts`, `tests/un-authz.test.ts` (the role table lists the new action).

How it works: after a pilot, `POST .../pilot/goals {action: "judge"}` has a model read, per test, the entity's goals (`ENTITY_GOALS`), what the test expects and what the agent produced, and say per goal whether it is served, with a reason. A failed call or an unreadable reply is "unjudged" and never a pass. Nothing counts until a person approves (`approve`, an approver chosen from the use case's list): they see every judgment and may override any of them, each with a reason. Approving recomputes the report from the stored runs with the judgments in force and stores it as a new report whose `basis` names the pilot and the hash of the approved review (refused if the approved parameters or test set changed since the pilot). `withdraw` takes an approval back. Judgments, overrides and approvals are one hash-chained log.

Model: `GOAL_JUDGE_MODEL`, else the app's chat model, over the same OpenAI-compatible endpoint (`LLM_BASE_URL`, `OPENROUTER_API_KEY` or `LLM_API_KEY`). With no key configured the route refuses and goal alignment stays "not measured".

Verified: the pure rules and the log are tested with a fake model. Not verified: a real model's judgments (no key was available in this session), the approve path over HTTP with real judgments.
