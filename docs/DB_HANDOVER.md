# Database handover: `t1-fixes` → `t1-db` (Shameer)

`t1-fixes` was built and tested without a database (`npm test`, `next build`). The migration and seed have since been applied to the hackathon Supabase project and verified (a manual verdict, a manual compliant flag and TRUNCATE are rejected; the live app shows UC01 and UC02 signed and attested). The task table below is kept as the record of what each step was.

**Order matters: back up, apply the migration, then deploy.** The new code writes columns that only exist after the migration (`compliant_report_id`, `verdict_*`, `un_trace_records`). Deployed first, the Sijil filing update would fail quietly.

**Copyright (resolved):** the DESC ISR and the Digital Dubai Matrix framework are no longer in this repository as full text. They were replaced by short quoted excerpts with URLs, the commits that carried them were squashed before anything was pushed, and the decision is recorded in `THIRD_PARTY_NOTICES.md`. The lower-risk news and web-page sources listed there are still open.

## Before applying anything

1. Back up: Supabase dashboard → Database → Backups, or `pg_dump`.
2. Look for hand-set values: `select ext_id, verdict, compliant from un_use_cases where verdict is not null or compliant;`. The dashboard already reads values without a run id and signer as unset. Decide: reset them (`update un_use_cases set verdict = null, compliant = false;` before the trigger exists) or re-derive them by running the scenarios (D-6).
3. Review `supabase/un-federal-t1.sql`. It adds: verdict provenance columns and the `un_guard_verdict` trigger (13.1); `compliant_report_sha256` (the plan says to store the report's sha256); the append-only `un_trace_records` table with UPDATE/DELETE/TRUNCATE blocked and a `un_trace_heads` view (D-8); `un_entities` (D-10). Then `supabase/seed-entities.sql`.
4. `supabase/un-federal-t2.sql` (applied after the above): the append-only, hash-chained `un_change_log` and its triggers on `un_use_cases`, `un_policy` and `un_hitl_rules`, which store the old and new value of every changed column, and `un_verify_change_log()`, which recomputes the chain and names the first broken row. The use-case page shows a use case's history and the chain status.

## What is already done in code (no database needed)

| Item | State |
|---|---|
| I-1 PATCH | `PATCH /api/admin/un/use-cases/[id]` returns 400 for `verdict` or `compliant`; the dashboard table has no verdict/compliant editors; `loadUnUseCases` masks values with no run id, head hash and signer (`src/lib/un/guard.ts`) |
| I-1 compliance | `fileReport` (`sijil-store.ts`) writes `compliant`, `compliant_report_id` and `compliant_report_sha256` together (D-3 is the code; it needs the migration) |
| I-2 | `RunEnv.hitl` and the HITL events in S1 are built; see D-4 for the database read |
| I-4 | `signRun()`, `signedVerdict()` and `verdictWriteFor()` are built and tested, and the sign route and button exist (see D-2); the database write has not been run |
| C4-2 | The step route stores trace rows after each step, heals missing rows on the next call, and refuses to advance if the rows and the displayed log differ. Only runs started after the migration set `trace_rows`; older runs keep the jsonb log only |
| C2-10 | Sijil route applies entity goals when `un_entities` has rows; the use-case page lists them. With no rows nothing changes |

## Signatures to call

```ts
// src/lib/un/signature.ts (re-exported from src/lib/un/runs.ts)
signRun(sc: Scenario, run: RunState, input: { signer_id: string; role: string; decision: "SIGN" | "WITHHOLD"; comment: string }, now: () => string): RunState
signedVerdict(run: RunState): { verdict: Verdict; signer_id: string; signed_at: string; head_hash: string } | null
signatureOf(run: RunState): TraceRecord | null

// src/lib/un/guard.ts: columns to write on the use case after a SIGN
verdictPatch(run: { id: string /* un_runs.id */; head_hash: string; done: boolean }, verdict: Verdict, clientFacing: boolean, signed: { signer_id: string; signed_at: string }): Record<string, unknown>

// src/lib/un/store.ts: the HITL loader (rows an entity switched off) and how the run takes it
loadHitlConfig(orgId: string): Promise<HitlConfig>   // HitlConfig = Record<entity, HitlRuleId[]>
// RunEnv.hitl in src/lib/un/scenario.ts: pass to nextStep(sc, run, env)
hitl?: { config: HitlConfig; entity: string; facts: { client_facing: boolean; affects_rights?: boolean; irreversible?: boolean } }
```

## Tasks

| Task | Plan | What to do | Done when |
|---|---|---|---|
| D-1 | I-1 | Apply the migration. | `PATCH` with `verdict` returns 400. In the SQL editor, `update un_use_cases set verdict = 'NO_GO' where ext_id = 'UC02'` fails on the trigger ("verdict may only be set from a completed scenario run") |
| D-2 | I-1, I-4 | **Built, applied and run against the live database (S1 and S2 signed).** `POST /api/admin/un/runs/[id]/sign` (`{ decision: "SIGN" | "WITHHOLD", comment }`, admin only) and a Sign / Withhold panel on the run page once a use-case run is done. It verifies the log and the stored trace rows, appends the signature record, saves the state and head hash with the same `updated_at` guard as the step route, stores the trace row and, for SIGN only, writes `verdict`, `verdict_run_id`, `verdict_head_hash`, `verdict_signed_by` and `verdict_signed_at` onto the use case in one update (`writeSignedVerdict` in `src/lib/un/runs.ts`, which uses `verdictWriteFor` in `signature.ts`). Calling it again on a signed run repeats only the verdict write, so a failure halfway can be healed. A WITHHOLD requires a comment and writes no verdict | S1 → release T0–T4 → Sign → the use case shows GO_SUPERVISED with the run and the signer and the dashboard counts it; a Withhold leaves it without a verdict; the trace viewer shows the signature as the last record; a manual `update ... set verdict` still fails on the trigger |
| D-3 | I-1 | Nothing to write. Run one Sijil attestation to 30 runs (passing profile) | `compliant` is true and `compliant_report_id` is set; a failing profile leaves it false; a manual `update … set compliant = true` fails on the trigger |
| D-4 | I-2 | **Wired (step route loads the entity's HITL rules at run start).** In the step route (`src/app/api/admin/un/runs/[id]/route.ts`) build `env.hitl` for gate runs: `const uc = await loadUseCase(who.org_id!, …)` for the run's `ext_id` (find it with `loadUnUseCases` and `ext_id === row.state.state.ext_id`), then pass `hitl: { config: await loadHitlConfig(who.org_id!), entity: uc.entity, facts: { client_facing: uc.client_facing, affects_rights: uc.affects_rights, irreversible: uc.irreversible } }` into `nextStep`'s env. `loadHitlConfig` already exists in `store.ts` | S1 T2 shows `client_facing_final_approval` in the reasons and in the verdict record's `hitl_breaches`; switching that rule off for the entity in HitlEditor removes it from the T2 reason (the gate still fails on its own evidence) |
| D-5 | C2-2, C2-8 | Open runs of S1, S2, S3 and S4 | "What each agent knows" and "Expected vs actual" render on the run page; the CSV downloads |
| D-6 | — | Re-seed: import `data/un-use-cases.csv`, run `supabase/seed-entities.sql`, run S1 (sign it, after D-2), S2, S3 and S4 once each, and one Sijil attestation | The dashboard shows engine-derived numbers only |
| D-7 | — | Merge `t1-fixes` and `t1-db` into main, redeploy, smoke test the live URL | The judges' link works with no console errors |

## Things to know

- **S2 changed** (C2-3): its expected path is now GO_SUPERVISED → ASSISTANT_ONLY → NO_GO → NO_GO → ASSISTANT_ONLY → GO_SUPERVISED, with an added `fee_accuracy` gate. The report's S2 description and `docs/demo-script.md` (S2 line) now describe the new path.
- **S4 added** (UC13 Qanat citizen mobility and fines assistant, the judges' added scenario): expected path ESCALATE → NO_GO → NO_GO → NO_GO → ASSISTANT_ONLY → GO_SUPERVISED. Two new optional gates, `no_commercial_promotion` (owner: compliance) and `purpose_limitation` (owner: privacy), join a run only when a message about them is accepted. The report docx/pdf were not touched and do not yet describe S4.
- **Policy engine**: `decide()` is unchanged. The only addition to `policy.ts` is an optional `fee_accuracy` gate (owner: compliance), which joins a run only when a message about it is accepted.
- **Retrieval** (full note and results: `docs/RETRIEVAL_NOTE.md`): BM25 is the default. `GET /api/admin/un/kb` returns `vector: "on" | "off"` and reports "on" only when `KB_VECTOR=on` is set in the environment, `kb/vectors.json` exists and the query embedder loads within `KB_VECTOR_TIMEOUT_MS` (8 s); otherwise it answers from BM25. To test: set `KB_VECTOR=on` on the deployed project, query the endpoint, and if the cold start is slow, unset it (or set `off`) and redeploy or restart. `kb/vectors.json` is built and committed (331 chunks, 768 dimensions; some excerpt-chunk vectors are approximate, see `docs/RETRIEVAL_NOTE.md`); to rebuild it, run `ollama pull nomic-embed-text`, then `python kb/build.py --embed`. Agent retrieval inside runs stays BM25 so runs reproduce.
- **No `.env` files or keys** are in this branch.

## Not done on `t1-fixes` (needs a download or a decision)

See the final summary in the pull request: knowledge-base ingestion (C1-1, C1-2), the vector build, the 30-question retrieval evaluation, the primary-source quotes for the gap table (C3-3), the report PDF re-export, and the report text changes in the plan's section 8.
