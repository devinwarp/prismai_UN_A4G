# Agent lifecycle journey: what was built

**Status, 26 November 2026:** all of this is on `main` (latest merge PR #55, `c358fd1`). The first version of this doc described the local branch `feature/agent-lifecycle-journey` (slices 0 to E, section 3). That branch was merged on 21 November (PR #19). Section 6 adds what was built on top of it between 22 and 26 November (PRs #29 to #55). Section 5 has the limits. The last full test run (26 November, scoped-roles branch before merge) was 793 tests: 792 pass, 0 fail, 1 skipped (live OCR); `tsc` clean.

## 1. Purpose

Show, for each use case, the journey from its SOP to an approved agent running in production under watch. A person decides at every step that matters.

The journey bar on every use-case page, and the JOURNEY column of the federal register, show nine stages:

1. **SOP intake**: the SOP is analysed, and the job profiles to automate are ticked.
2. **Risk and gates**: the gates of the country's rule set, plus any the use case adds.
3. **Verdict**: a signed scenario run assesses the use case.
4. **Tests and parameters**: process targets, the test set (hand-written plus approved AI-generated cases) and the verdict thresholds. Each is proposed, then approved by a person.
5. **Pilot and verdict**: the agent runs the approved tests. A model judges goal alignment, and a person approves the judgments.
6. **Pilot evals**: expected output against actual output, case by case.
7. **Tuning**: the tuning agent and people improve the agent. Every version is logged and can be reversed.
8. **Approval**: the process owner signs the agent version, but only when the pilot is met (release gate).
9. **Production**: go-live behind the same gate, then the watchdog.

All screens work in English and Arabic (RTL).

## 2. Sijil model used

Sijil is treated as inference-level attestation. It reports two numbers per run: **calls** and **rejected calls** (unauthorised or misaligned actions). `src/lib/un/sijil-calls.ts` has:

- `simulatedGate`: a stand-in gate used by the simulated agent.
- `statsFromRecords`: maps live Sijil records to the same counts. The `LIVE_REJECT_DECISIONS` vocabulary is an assumption and needs confirming against a real node.

## 3. What was built first, by slice (to 21 November)

These slices are the foundation. Section 6 says what later work replaced or extended. In particular, slices A to C used a simulated subject agent; the pilot now runs the real SOP agent of slice E, with an optional model-driven reasoner.

### Slice 0: offline seed fix (4f4f3e2)
`src/lib/supabase/offline.ts` now saves the seed immediately, so pages and API routes agree on use-case ids. This fixed "Use case not found" in offline mode.

### Slice A: pilot evals (313c0a9)
- **Eval sets** (`evalset.ts`): 10 cases each for UC01 and UC02, split into tuning, held-out and reserve.
- **Subject agent** (`subject.ts`): a simulated agent with seeded weaknesses. Rules that harden it: `answer_from_record_only`, `use_only_allowed_tools`, `officer_release`, `disclose_ai`.
- **Grader** (`grade.ts`): deterministic. Verdicts are `correct`, `hallucinated`, `misaligned` and `incomplete`. Each finding carries a code and parameters, so it translates.
- **Runner** (`eval-run.ts`): runs a set, computes alignment and the Wilson lower bound.
- **Screens**: a per-use-case eval dashboard (expected vs actual, with a verdict per case), a side-by-side overview at `/admin/federal/evals`, and a run API.
- **Storage**: `eval-store.ts` and `supabase/un-agent-lifecycle.sql` (tables `un_eval_runs`, `un_tuning_log`, `un_watchdog_log`). The SQL is written but **not applied** to any database.

### Slice B: tuning, log and approval (206ab8e)
- **Optimiser** (`tuning.ts`): reads only the tuning cases and throws if it touches held-out ones. It proposes rule changes, applies them, and re-runs.
- **Held-out integrity**: a held-out case that fails is "burned" (moved to tuning) and a fresh reserve case is released.
- **Iteration log**: append-only and hash-chained (`ChainEntry<K>`, canonical sorted-key JSON so hashes survive a jsonb round trip). `verifyChain` detects tampering.
- **Approval**: a person signs or withholds on the tuning page. Approval sets `stage = "approved"` only and never writes a verdict, which stays engine-only.
- **Screens**: tuning page with the iteration log, controls and approval form; routes for running a cycle, resetting and approving.
- **Arabic**: `i18n/lifecycle-ar.ts`, plus `EvalText.tsx` for translated findings, reasons, rules and cases.

### Slice C: production watchdog (6d6761e)
- **State machine** (`watchdog.ts`): active, warned, suspended, probation.
- **Penalties**: 10 per Sijil-rejected call (capped at 40 a window), warning 5, probe-only suspension 10, repeat offence extra 15, three clean windows to leave probation. Trust score and strikes are replayed from the log, not stored.
- **Takedown**: recorded in the log with a rollback to the last approved version. It is **not enforced** against any live system.
- **Reinstatement**: needs a person and a comment on what was fixed, then returns the agent on probation.
- **Screens**: production page with a deploy button, a monitoring window, a "simulate a regression" control (drops a chosen rule) and the log. Same hash-chain verification.

### Slice D: SOP knowledge base, skill extraction and ReAct
- **The SOP** (`data/sops/uc02-trade-licence-renewal-sop.md`): fictitious SOP-LIC-014 for UC02, four job profiles, tasks T01 to T20. Sections 10 to 13 hold the required documents (D1 to D6) and how to submit them, a detailed description of every task, decision rules R1 to R7 and ten applicant questions. Annex A is the answer key for testing an analyzer and is **never indexed**.
- **Knowledge base** (`src/lib/un/sop-kb.ts`, `scripts/build_sop_kb.ts`): 66 chunks (one per task, document, rule, question, role), each with a breadcrumb and a hash, embedded with nomic-embed-text-v1.5 via transformers.js into `kb/sop/SOP-LIC-014/`. Kept apart from the regulatory `kb/` on purpose.
- **Vectorisation is mandatory for automated agents**: `requireVectorised` and `searchSopForAgent` refuse missing or out-of-date vectors and never fall back to keyword search.
- **Skill extraction** (`extractSkill`, `scripts/extract_skill.ts`): the agent's instructions for one job profile, assembled verbatim from the SOP (role and authority, that profile's tasks, controls, escalation) plus the ReAct and outside-information rules. Two extracted: Document Verification Analyst, Fee and Payment Officer.
- **ReAct loop** (`src/lib/un/react-sop.ts`): Thought, Action, Observation over the SOP. It rewrites queries with an SOP glossary, narrows by passage kind, searches on keywords, splits compound questions. It ends only in a citation the loop checked, or in the required `request_outside_information` call (also forced for an uncited finish, a name the SOP never mentions, or the step limit).
- **Measured** (14 new questions, vectors on): in-SOP 6 of 8 correct, 0 wrong, 2 sent outside; outside-SOP 4 of 6 sent outside before the unknown-name rule, which was added after seeing the leaks. "Head of licensing by name" still leaks. Hybrid beat BM25 on a separate 12-question set (top 3: 11 of 12 against 8 of 12), unlike the regulatory KB.

### Slice E: the licence-renewal agent, OCR, case memory and per-task evals
This closes the gap that slices A to C evaluated a simulated agent that did not use the skill or the SOP. The agent below does, and the per-task evals test it.
- **Agent** (`src/lib/un/analyst-agent.ts`): opened for one job profile from the real extracted skill, so a task outside the skill is refused and sent to its owner (the Analyst cannot approve; the Fee Officer cannot check leases). It refuses to open if the SOP is not vectorised. It is a deterministic, rule-based executor, **not a language model**.
- **SOP figures come from the KB** (`sop-rules.ts`): the 30-day grace period, 12-month lease, 30-day ID validity, 250,000 cover, fee table, late-fee percentage and 14-day notice are read out of the retrieved SOP passages through ReAct, with their chunk ids. If one cannot be found the required outside-information call is made and the agent stops. Edit the SOP, rebuild, and behaviour changes (a test shows the lease cases flip when "12 months" becomes "6 months").
- **Image upload and OCR** (`doc-ocr.ts`): `receiveDocument` OCRs an image with tesseract.js, classifies it (D1 to D4), extracts the fields and checks them against the licence record and the SOP figures. A low-confidence or unrecognised read is not trusted and the applicant is asked for a clearer copy through T10. A blurred scan is covered by an eval.
- **Persistent case memory** (`case-memory.ts`): an append-only, hash-chained log per case. State is replayed from it, so it survives a new session and is handed from the Verification Analyst to the Fee and Payment Officer. Only extracted fields, the image hash and the OCR confidence are stored, never the image (SOP control 4). `supabase/un-agent-runtime.sql` and `case-memory-store.ts` are written for Supabase and **not applied or tested against a database**.
- **Synthetic documents** (`fixtures-uc02.ts`, `scripts/make_synthetic_docs.ts`): 19 fictitious PNGs (four good sets and defects such as a short lease, a wrong address, an unregistered lease, an expiring ID, low cover, a lapsed policy, a blurred scan, a price list). Real Tesseract output for each is recorded in `ocr-cache.json` by image hash so tests run offline; `OCR_LIVE=1` re-runs OCR live and checks it agrees.
- **Per-task evals** (`task-evals.ts`, `scripts/run_task_evals.ts`): 54 cases over T04 to T13, the authority limits and KB answers; 25 are labelled held-out (boundaries and adversarial inputs) and 29 are the plain cases; the labels only describe the cases, since nothing is tuned on them yet. Verdicts: correct, wrong, unsafe (breaks a control, e.g. mail to a non-registered address) or uncited. All 54 pass with BM25 and with required vector retrieval. Run `node scripts/run_task_evals.ts [--vector] [--live-ocr]`.

## 4. How to see it

- **Offline.** Run with `OFFLINE=1` (file store `.data/offline-db.json`, auto-signed-in admin).
  - Open a use case. The tabs follow the journey: Overview, SOP, Targets, Tests, Pilot, Evals, Tuning, Production.
  - The offline banner has a **Sign in as** picker (from the test roster), so you can see each role: entity admin, governance admin, process owner, operator and judge.
  - `OFFLINE_ROLE=viewer` still previews the read-only judge.
- **Hosted.** At https://prismai-un.vercel.app, "Enter the live demo" signs in the read-only judge with one click, once `JUDGE_LOGIN_EMAIL`/`JUDGE_LOGIN_PASSWORD` are set where the app is hosted.
  - Role accounts need the steps in `docs/un-people-and-inbox.md`: two SQL files and the seed script.
- **Command line.**
  - `node scripts/run_task_evals.ts [--vector] [--live-ocr]` runs the per-task evals.
  - `scripts/sijil_pilot_check.ts` and `scripts/sijil_loop_check.ts` run the pilot against a local Sijil node.

## 5. Limits to state plainly

- **The lifecycle screens no longer use only the simulated agent, but parts are still simulated.**
  - The pilot runs the real SOP agent (rule-based by default, with an optional model reasoner), and goal alignment is judged by a model.
  - The Evals page (slice A) and the production watchdog's serving agent and drift are still the simulated subject.
- **Sijil.** Pilot runs can be sealed into a real Sijil node, and agent model calls screened by it (section 6). That was proved against a local node only.
  - Without a configured node every figure falls back to the simulated gate, and the Pilot page says which source it used.
  - The node's own `GET /api/verify` still reports orphan tool calls (open on the Sijil side).
- **Takedown is recorded, not enforced.**
- **Log protection in the database.** `supabase/un-log-guards.sql` (applied 21 Nov 2026) makes `un_gate_log` refuse UPDATE and DELETE, and makes `un_tuning_log`, `un_watchdog_log` and `un_eval_runs` refuse UPDATE. Those three still allow DELETE because the admin-only demo reset clears a use case's log between runs, so they are append-only in normal use and tamper-evident through the hash chain, not tamper-proof against deletion by a database administrator. The case-memory and tuning-version logs (`un_case_memory`, `un_kb_log`) refuse both. All were tested with rollback transactions.
- **Database tables are created but not yet exercised.** The SQL was applied to the hackathon Supabase project on 21 Nov 2026. Hosted persistence of the new logs, and the database-level append-only triggers, have not been tested with real writes from the app.
- **Arabic strings are drafts** and need native-speaker review.
- **Policy jurisdictions** remain simplified demos.
- **The evaluated agent is rule-based, not a language model.** Slice E links the skill, KB, ReAct, OCR and memory into one path and tests it, but nothing here shows how a real model would behave. Slices A to C still use the simulated subject; slice E evals are separate from the lifecycle screens and are run from the command line.
- **Per-task evals were written by the person who built the agent**, against fixtures the agent was built for, and passed on the first full run after one fix to a test. The mutation test shows they can fail, but they do not show the agent copes with real documents: real scans are messier than rendered text, only English and one OCR engine were tried, and D5 (authorisation letter) and D6 (translation) are not checked.
- **Retrieval numbers come from small question sets** written by the person who tuned the glossary. Read them as a first measurement.
- **Not in the technical report.** The report does not mention any of this, so it does not support these features as written.
- **Release gate gaps** (`docs/un-release-gate.md`):
  - A signed GO scenario run still sets the stage label to "deployed"; the production state itself is gated.
  - A confirmed `agent_wrong` ruling does not yet feed tuning.
  - There is no separate signature of the final report.
  - A model-driven pilot takes minutes and is not a background job.
- **People, roles and inbox are not live on the hosted project yet.** `supabase/un-scoped-roles.sql` and `supabase/un-agent-inbox.sql` have not been applied there, and the test accounts have not been created. The code degrades safely without them.
- **Inbox agents are deterministic.** They stage users and hand over what they cannot do. Only consult replies are drafted by a model, and a person always sends them.
- **Contradictions seen in the front end on 26 November** are listed in `docs/qa/frontend-journey-2026-11-26.md`. For example, UC02 reads "approved" while its journey says "Next: SOP intake", and alignment is 0 of 20 in the headline but ✓ in every row.

## 6. After the merge

### 6.1 The merge into main (21 November 2026)

This branch was merged into `main` together with the gates, journey bar, tuning screen, outside queue, model reasoner and SOP intake work (PR #19). The plan page (https://claude.ai/artifact/LDY5tP1vfXCpiLsqTjsv53) holds the full, current status. In short:

- **Built since this doc was first written:** SOP intake with an analyzer and the Automate checkbox (per-profile assessment, most restrictive verdict); gates per rule set and per use case, held as data, add-only, with waivers; the journey bar; front-end tuning of the agent's settings, glossary, skill rules and question bank; the outside-request queue; a model reasoner behind ReAct; D5, D6 and a heuristic forged-document check; 117 per-task evals.
- **Decisions settled on 21 November:** ticked profiles roll up by the most restrictive verdict; a task whose output reaches the applicant is client-facing even when a person releases it (pinned by `tests/un-approvers.test.ts`); a use case adds gates and never removes a rule-set gate; every gate change needs an approver chosen from a list, never typed. Until the org chart is built the list is the process owner (the default, read from the SOP's document control) and the SOP's job titles, or a short list of governance roles for org-wide gate changes and for a use case with no SOP.
- **Gate approvals written before that change** have no approver recorded. A gate added to a use case without one shows as unsigned, so stage 2 of the journey bar asks for it.
- **Still open then** (see 6.3 for today; the org chart is now built as scoped roles): the org chart itself; the Phase 2 private-engine adapter; two more fictitious SOPs, and PDF input for SOP intake; the human labels for the citation check and blind scenarios from outside the team; real Sijil counts and real metric-gate measurements (both simulated); enforced takedown; retrieval from the database instead of files; the technical report predates the lifecycle merge; the Arabic strings need a native-speaker review; several SOP rules were invented for the demo (60 days early, 15 working days on hold, a 14-day fee notice, 250,000 cover, 10 MB uploads).

### 6.2 Built from 22 to 26 November (PRs #29 to #55)

**Tests and parameters (stage 4)**
- **Roles and permissions** gate every route (`authz.ts`).
- **Tests derived from the skill.** The test set is stored, approved and locked by a person who did not write it. Verdict parameters (thresholds) are also proposed and approved (PR #29).
- **Process targets** (`targets.ts`): measured targets per use case, proposed by the business owner and approved by the governance admin.
- **AI test-case generator** (PR #33, #35; `docs/un-testgen-design.md`):
  - A model writes cases for one task from the skill, risk, gates and retrieved SOP lines.
  - Code validates them: every citation must be an SOP chunk, and the input must use the agent's own fields.
  - There is at most one repair pass. A person accepts each case into the test set.

**Pilot (stage 5)**
- **Pilot engine** (`pilot.ts`, `pilot-run.ts`): runs the approved test set on the real SOP agent of slice E, under the approved parameters.
  - Authority and outside-the-SOP probes execute, and client-facing scenarios and SOP controls run on the agent's own output.
  - `agent: "llm"` lets a model (`AGENT_LLM_MODEL`) choose the ReAct searches and write the T12 fee notices. The default is the code-based reasoner.
  - A sample run is recorded as a sample and is never conclusive.
- **Goal judge** (`goal-judge.ts`): a model, of a different family from the agent, judges each run against the entity's goals (eight calls at a time).
  - A person approves the judgments, and the report is recomputed with them.
  - The review records the goal set it judged against. A per-test drill-down shows the evidence (PR #32).
- **Generated cases in the pilot** are reported apart from the baseline. A disputed case is ruled `expectation_wrong` or `agent_wrong` by the process owner.
- **Agent accuracy** (PR #39): stronger ReAct prompt, a reflection step on answers, write-check-revise for fee notices, and "which documents are required" answered with the whole list.

**Tuning (stage 7)**
- **Tuning agent** (`auto-tune.ts`, `autotune-service.ts`, PR #39). It implements the spec decided on 24 November:
  - It applies low-risk edits on its own only while alignment on **held-out** cases is below a limit. The default is 95%, and the owner can set it between 90% and 98%.
  - Above the limit, and always for edits that touch a control, client-facing instructions or refusal behaviour, it only proposes.
  - Every applied version passes a no-regression check and is logged as "tuning agent (auto)", so it can be rolled back.
  - Its budget per day is 6 cycles and 60 model calls, and it stops after 3 cycles with no gain.
  - Only the process owner switches it on or off, and the dashboard says when it is running.

**Approval and production (stages 8 and 9)**
- **Release gate** (`release-gate.ts`, `docs/un-release-gate.md`). Approval and go-live both need a **met pilot**:
  - It ran under the test set and thresholds approved now.
  - The goal judgments were approved by a person.
  - The report is conclusive, with no threshold failing.
  - No generated case is unruled or ruled `agent_wrong`.
  - The approved targets are proven by the pilot, and the parameters are at least as strict as the targets.
  - Every control target held.
  - A manual stage change to approved or deployed is refused. A signed verdict assesses; only the approval sets approved, and only go-live sets deployed.
- **Cost ledger** (`cost.ts`, `cost-ledger.ts`, `docs/un-cost.md`):
  - Every model and tool call in test generation, pilot, judging, tuning and production is metered with tokens, price and time.
  - The approver sees the gross total, and the approval records it.

**Sijil (PRs #46 to #48; `docs/sijil-wire-format.md`)**
- Each pilot run's tool calls and deliverable can be sealed into a Sijil node, with a per-run fallback to the simulated gate.
- A deliverable missing its AI disclosure is sealed as `flag`.
- The agent's model calls can be screened by the node before inference. A block ends the run `blocked_by_sijil`; it counts as a pass when the case was an attack, and as a failure otherwise.
- All of this was proved end to end against a local node, not a hosted one.

**The journey on screen (PRs #41, #43 to #45, #50, #51)**
- A shared use-case header, a **Next step** card, tabs, a thin stage strip, and the blockers mapped to the page that fixes them.
- Country profiles, with entities linked to a country and the dashboard scoped to the active country.
- A federal dashboard on one screen, with reruns, SOP versions, and a fictitious process owner per use case.
- Risk flags in the register, and AI disclosure as a mandatory gate.
- The register reads "alignment" instead of "compliance" until Sijil attestation is integrated.
- A **Work by** column (human, agent working, agent done) and a three-door landing page with one-click read-only judge entry.

**People, roles and the agent inbox (PRs #52 to #55; `docs/un-people-and-inbox.md`)**
- **Scoped roles:** organisation, country, entity or use case, plus a new `entity_admin`.
  - Approving targets, test sets and thresholds moved from the process owner to the country's **governance admin**. The owner proposes.
  - With no governance admin, requests go to the platform admin, and the Country screen lists "appoint a governance admin" as a required action.
- **Agent inbox.** Every person has an inbox and an agent that does the Responsible work within that person's permissions.
  - Explicit decisions are always a person's: approvals, signing, deploying, gates, goal judgments and reruns.
  - Refused or thrice-failed actions go to the person with the reason. Unanswered items escalate after two working days.
  - Lifecycle events now raise items: proposals and approvals, pilot filed, goal judgments, rerun, agent version ready or signed, tuning proposals, and production warnings or takedowns.
  - Consult replies are drafted by a model, with a rule-based fallback.
  - Housekeeping: put all away, archive with restore, and who an item waits on.
- **People agent.** It finds unfilled positions (process owner, operator, SOP job profiles by exact job title) and countries without a governance admin, and raises them.
- **RACI by use case** (`/admin/federal/raci`): defaults come from roles. Overrides per person and use case require one Accountable who may approve.

### 6.3 Still open (26 November)

- **Hosted project setup.** Apply the two inbox/roles SQL files, then seed the test accounts and set the judge and super-user hosting settings (runbook in `docs/un-people-and-inbox.md`). Then run its five-role check: the entity admin, a process owner, the governance admin, the super admin and the judge.
- **Pilot evidence.** No use case has a met pilot on the live site yet; the federal register shows 0 of 20 deployed.
- **Agent stays partly simulated.** The Evals page and the production watchdog still use the simulated subject agent. Takedown is not enforced.
- **Sijil on a hosted node.** Live counts and real metric-gate measurements still need a hosted node, and the orphan-tolerant verify needs fixing on the Sijil side.
- **Earlier decisions not yet built.** These were decided on 21 and 22 November:
  - The goal judge asks the client-facing goals (MARSA-G3/G4) only on client-facing tests.
  - The final report gets its own signature by the process owner.
  - A confirmed `agent_wrong` ruling feeds the tuning cycle.
- **Carried over from 21 November:**
  - Two more fictitious SOPs, and PDF input for SOP intake.
  - Retrieval from the database instead of files.
  - The technical report, which predates all of this.
  - Native-speaker review of the Arabic.
  - The invented SOP rules listed in 6.1.

## 7. Commits

| Commit | Content |
|---|---|
| 4f4f3e2 | Offline store: persist the seed |
| 313c0a9 | Slice A: pilot eval sets, grading, Sijil call stats |
| 206ab8e | Slice B: tuning loop, hash-chained log, approval, Arabic |
| 6d6761e | Slice C: production watchdog, penalties, takedown, reinstatement |

Merged into `main` since (merge or squash commits):

| PR | Commit | Content |
|---|---|---|
| #19 | (21 Nov) | This branch, with gates, journey bar, tuning screen, outside queue, model reasoner and SOP intake |
| #29 | c105b05 | Roles and permissions, test set and verdict parameters, pilot engine, goal judge, people screen |
| #32 | 8dc9233 | Goal review records its goal set; per-test drill-down |
| #33, #35, #36 | fffe2c6, 4d60d2d, 111a687 | AI test-case generator, one repair pass |
| #34 | 81c61f2 | Pilot runs each profile's own role |
| #39 | d01b5fc | Release gate, tuning agent, cost ledger, agent accuracy, generated cases in the pilot |
| #41 | 6af134e | Use-case header, Next step card, tabs and stage strip |
| #43 to #45 | 5613a24, 4a4715f, ae1d5c4 | Countries, KB status labels, one-screen federal dashboard, process owners |
| #46 to #49 | f32c0ed, d1757db, 300a7ab, b8c61b3 | Sijil sealed runs and pre-inference screening |
| #50 | 3af2b9e | Country onboarding, responsive dashboards, disclosure gate |
| #51 | f11db27 | Landing page, sign-in pop-up, judge read-only access, Work by column |
| #52 | beb3879 | Scoped roles, entity admin, agent inbox, RACI by use case, hosted runbook |
| #53 to #55 | 7fec360, cb82c1e, c358fd1 | Inbox events, model-drafted consult replies, inbox housekeeping |
