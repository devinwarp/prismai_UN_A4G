# Agent lifecycle journey: what was built

Branch: `feature/agent-lifecycle-journey` (local only, above `main` at fc33cfc; not pushed, no PR).
Size: slices 0 to C are 32 files, about 2,800 lines. Slice D (SOP knowledge base and ReAct, below) adds the SOP, 2 libraries, 2 scripts, 2 test files and the built `kb/sop/` store. Slice E (the licence-renewal agent, OCR, case memory and per-task evals) adds 6 libraries, 3 scripts, synthetic documents and 1 test file. Full test run: 215 pass, 1 skipped (live OCR, `OCR_LIVE=1`); `tsc`, lint and `next build` clean.

## 1. Purpose

Show, for each use case, the journey from a pilot to an approved agent running in production under watch:

1. **Pilot eval**: run the agent against an eval set and compare expected output with actual output, flagging hallucination and misalignment.
2. **Tuning**: a second agent reads the failures and strengthens the rules, then re-tests.
3. **Iteration log**: every step is recorded in a tamper-evident log, so the improvement can be shown over time.
4. **Approval**: a person signs only when Sijil recorded zero rejected calls and every held-out case is correct.
5. **Production watchdog**: the same evals keep running. A Sijil-rejected call is penalised, and the agent is suspended and taken down if it misbehaves.

All new screens work in English and Arabic (RTL).

## 2. Sijil model used

Sijil is treated as inference-level attestation. It reports two numbers per run: **calls** and **rejected calls** (unauthorised or misaligned actions). `src/lib/un/sijil-calls.ts` has:

- `simulatedGate`: a stand-in gate used by the simulated agent.
- `statsFromRecords`: maps live Sijil records to the same counts. The `LIVE_REJECT_DECISIONS` vocabulary is an assumption and needs confirming against a real node.

## 3. What was built, by slice

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

Run with `OFFLINE=1` (file store `.data/offline-db.json`, auto-signed-in admin). Open a use case, then **Evals**, **Tuning** and **Production**. Each page has a reset button. `OFFLINE_ROLE=viewer` previews the read-only judge view.

## 5. Limits to state plainly

- **Simulated, not a real model.** The subject agent is a deterministic simulation with seeded weaknesses. The eval results are not real model output.
- **Sijil figures are simulated** in this branch. A live adapter exists only as a record mapper and is untested against a real node.
- **Takedown is recorded, not enforced.**
- **Log protection in the database.** `supabase/un-log-guards.sql` (applied 21 Nov 2026) makes `un_gate_log` refuse UPDATE and DELETE, and makes `un_tuning_log`, `un_watchdog_log` and `un_eval_runs` refuse UPDATE. Those three still allow DELETE because the admin-only demo reset clears a use case's log between runs, so they are append-only in normal use and tamper-evident through the hash chain, not tamper-proof against deletion by a database administrator. The case-memory and tuning-version logs (`un_case_memory`, `un_kb_log`) refuse both. All were tested with rollback transactions.
- **Database tables are created but not yet exercised.** The SQL was applied to the hackathon Supabase project on 21 Nov 2026. Hosted persistence of the new logs, and the database-level append-only triggers, have not been tested with real writes from the app.
- **Arabic strings are drafts** and need native-speaker review.
- **Policy jurisdictions** remain simplified demos.
- **The evaluated agent is rule-based, not a language model.** Slice E links the skill, KB, ReAct, OCR and memory into one path and tests it, but nothing here shows how a real model would behave. Slices A to C still use the simulated subject; slice E evals are separate from the lifecycle screens and are run from the command line.
- **Per-task evals were written by the person who built the agent**, against fixtures the agent was built for, and passed on the first full run after one fix to a test. The mutation test shows they can fail, but they do not show the agent copes with real documents: real scans are messier than rendered text, only English and one OCR engine were tried, and D5 (authorisation letter) and D6 (translation) are not checked.
- **Retrieval numbers come from small question sets** written by the person who tuned the glossary. Read them as a first measurement.
- **Not in the technical report.** The report does not mention any of this, so it does not support these features as written.

## 6. Status after the merge into main (21 November 2026)

This branch was merged into `main` together with the gates, journey bar, tuning screen, outside queue, model reasoner and SOP intake work (PR #19). The plan page (https://claude.ai/artifact/LDY5tP1vfXCpiLsqTjsv53) holds the full, current status. In short:

- **Built since this doc was first written:** SOP intake with an analyzer and the Automate checkbox (per-profile assessment, most restrictive verdict); gates per rule set and per use case, held as data, add-only, with waivers; the journey bar; front-end tuning of the agent's settings, glossary, skill rules and question bank; the outside-request queue; a model reasoner behind ReAct; D5, D6 and a heuristic forged-document check; 117 per-task evals.
- **Decisions settled on 21 November:** ticked profiles roll up by the most restrictive verdict; a task whose output reaches the applicant is client-facing even when a person releases it (pinned by `tests/un-approvers.test.ts`); a use case adds gates and never removes a rule-set gate; every gate change needs an approver chosen from a list, never typed. Until the org chart is built the list is the process owner (the default, read from the SOP's document control) and the SOP's job titles, or a short list of governance roles for org-wide gate changes and for a use case with no SOP.
- **Gate approvals written before that change** have no approver recorded. A gate added to a use case without one shows as unsigned, so stage 2 of the journey bar asks for it.
- **Still open:** the org chart itself; the Phase 2 private-engine adapter; two more fictitious SOPs, and PDF input for SOP intake; the human labels for the citation check and blind scenarios from outside the team; real Sijil counts and real metric-gate measurements (both simulated); enforced takedown; retrieval from the database instead of files; the technical report predates the lifecycle merge; the Arabic strings need a native-speaker review; several SOP rules were invented for the demo (60 days early, 15 working days on hold, a 14-day fee notice, 250,000 cover, 10 MB uploads).

## 7. Commits

| Commit | Content |
|---|---|
| 4f4f3e2 | Offline store: persist the seed |
| 313c0a9 | Slice A: pilot eval sets, grading, Sijil call stats |
| 206ab8e | Slice B: tuning loop, hash-chained log, approval, Arabic |
| 6d6761e | Slice C: production watchdog, penalties, takedown, reinstatement |
