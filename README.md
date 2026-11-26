# Prism for public services: agentic AI approval and assurance

[![CI](https://github.com/devinwarp/prismai_UN_A4G/actions/workflows/ci.yml/badge.svg)](https://github.com/devinwarp/prismai_UN_A4G/actions/workflows/ci.yml)

Entry for the AI for Good Lab Hackathon: United Arab Emirates (ITU). Prism governs the path from an AI
use case to a deployed, attested agent in government: it configures a policy
target, imports use cases, has role agents examine each one against a
knowledge base built with ITU's reference pipeline, lets a deterministic policy
engine decide, and records every step in a hash-chained trace log.

All entities and data are fictitious. The Sijil panel is a labelled simulation.

Technical report: [`docs/report/prism-technical-report.pdf`](docs/report/prism-technical-report.pdf)
(Y.3172 and AI Readiness Report 2.0 mappings, scenarios, gaps).

## What it does

| Area | Where |
|---|---|
| Policy config, use-case CSV import, federal dashboard (deployed % beside aligned %) | `src/lib/un/model.ts`, `src/app/admin/federal/` |
| Knowledge base (32 sources, 398 chunks, SHA-256 provenance) built with ITU's code; the country demo adds 8 Singapore sources (59 chunks, 40 sources and 457 chunks in all) | `kb/` |
| Eight role agents, typed coordination protocol | `src/lib/un/agents.ts`, `protocol.ts`, `round.ts` |
| Deterministic policy engine: five hard gates never averaged, client-facing cap at `GO_SUPERVISED` | `src/lib/un/policy.ts` |
| Staged scenarios S1 (gate engine), S2 (voice contact centre), S3 (federal cascade) and S4 (consumer complaint escalating to a privacy breach) | `src/lib/un/scenario.ts`, `scenarios.ts` |
| Hash-chained reasoning traces, verifier, replay, trace viewer | `src/lib/un/trace.ts`, `src/app/admin/federal/runs/` |
| Sijil panel: runs, attestation, rejects per criterion, auto-filed pilot reports | `src/lib/un/sijil.ts`, `src/app/admin/federal/use-cases/` |
| Per-entity human-in-the-loop rules (breach = hard-gate failure) | `src/lib/un/hitl.ts`, `src/app/admin/federal/HitlEditor.tsx` |
| SOP intake: analyse a text or markdown procedure, promote it to a governed use case | `src/lib/un/sop/`, `src/app/admin/federal/sop/` |
| Evaluation: LLM mode (two models), red team, citation-support sample, blind-scenario how-to | `docs/eval/README.md`, `scripts/eval_agents.ts` |
| Accessibility lint and draft standards note | `docs/accessibility-check.md`, `docs/standards-note.md` |

## Architecture, in ITU-T Y.3172 terms

Prism's pipeline follows the Y.3172 logical architecture for machine learning
in future networks. In Y.3172 the **P (policy)** node applies policies to the
output of the model node; in Prism that is the deterministic policy engine, and
nothing downstream of it can change a verdict. (The standard's P node is a
policy node, not a "policer".)

```
 SRC ──► C ──► PP ──► M ──────► P ──────► D ──► SINK
 use     import  clean  role     policy    coordinator  dashboard,
 cases,  / pull  and    agents   engine    messages     signed verdict
 events                 (propose)(decide)  and trace
                 ▲                  ▲
   MLFO ─────────┴── orchestrates ──┘      ML sandbox: staged scenarios S1-S4
   ML intent: policy target + each use case's requested autonomy
```

| Y.3172 node | What it is in Prism | Where |
|---|---|---|
| SRC (source) | Use cases (CSV), scenario events, Sijil records | `data/un-use-cases.csv`, `src/lib/un/scenarios.ts` |
| C (collector) | CSV import; pull from a Sijil node | `src/app/api/admin/un/import/`, `src/lib/un/sijil-live.ts` |
| PP (pre-processor) | CSV parsing and validation; grouping Sijil records into runs; knowledge-base cleaning and chunking | `src/lib/un/model.ts`, `sijil-live.ts`, `kb/build.py` |
| M (model) | The role agents (deterministic rules, or an LLM that may only add to them) | `src/lib/un/agents.ts`, `src/lib/llm.ts` |
| **P (policy)** | **Policy engine: hard gates, client-facing cap, human-in-the-loop rules** | **`src/lib/un/policy.ts`**, `hitl.ts`, `guard.ts` |
| D (distributor) | Coordinator: applies messages, asks the policy engine, records the verdict message | `src/lib/un/protocol.ts`, `round.ts` |
| SINK | Federal dashboard; the use case's verdict (written only from a signed run) | `src/app/admin/federal/`, `src/lib/un/guard.ts`, `signature.ts` |
| MLFO (orchestrator) | Releases a scenario step by step; saves state between steps | `src/lib/un/scenario.ts`, `src/app/api/admin/un/runs/` |
| ML sandbox | Staged scenarios on synthetic data; S3 runs on a sandbox copy of the use cases | `src/lib/un/scenarios.ts`, `scenario.ts` |
| ML intent | Policy target, counting rule and each use case's requested autonomy | `Policy` in `src/lib/un/model.ts`, `un_policy` table |

An in-app architecture page and a declarative `intent.json` per run are planned
for the shortlist (plan items C5-2 and C5-3).

## Run it

```bash
cp .env.example .env.local     # fill in Supabase, OPENROUTER_API_KEY, ADMIN_EMAILS
# In a new Supabase project's SQL editor, run in order:
#   supabase/schema.sql
#   supabase/un-federal.sql
#   supabase/un-federal-t1.sql   (verdict guard, append-only trace table, entities)
#   supabase/un-federal-t2.sql   (tamper-evident change history)
#   supabase/seed-entities.sql   (after importing the use cases)
#   Lifecycle (optional, for the pilot, gates, tuning and outside-queue screens; pgvector must be enabled):
#   supabase/un-agent-lifecycle.sql, un-agent-runtime.sql, un-gates.sql, un-profiles.sql,
#   un-sop-kb.sql, un-outside-queue.sql, then un-log-guards.sql
#   (un-roles.sql, un-test-sets.sql and un-verdict-params.sql and un-pilot-reports.sql are written but NOT applied; see docs/un-shared-edits.md)
#   Country and knowledge base screen (optional): supabase/un-country.sql, after un-log-guards.sql
npm ci
npm run dev                    # http://localhost:3000 -> /admin/federal
npm test                       # 490 tests (488 pass, 2 skipped), no database needed
```

Sign in with an email in `ADMIN_EMAILS`, open **Federal**, import
`data/un-use-cases.csv`, then **Run a staged scenario**.

### Judge access, replay and the offline kit

- **Judges** (read-only): put their emails in `JUDGE_EMAILS`. On first sign-in they become `viewer`s in the demo workspace (`JUDGE_ORG_ID`, else the first admin's). They can open the dashboard, runs, traces, KB explorer and gaps; every mutating `/api/admin/un/*` route calls `requireAdmin()` and answers 403 (a test fails if a new one forgets).
- **`/replay`** needs no login and no database: S1 to S4 replayed deterministically from the recorded backup `public/replay/backup-run.json` (falls back to a fresh deterministic build). Re-record with `npm run export-replay`.
- **Fully offline** (no Supabase, no network): `OFFLINE=1 npm run dev`. Data lives in `.data/offline-db.json` (delete it to reset), you are signed in as a seeded admin with the 20 use cases imported, and `OFFLINE_ROLE=viewer` previews the judge view. It also switches on by itself when the Supabase env is absent, but never in production. With `NODE_ENV=production`, `OFFLINE=1` is ignored unless `OFFLINE_ALLOW_PRODUCTION=1` is also set (the offline mode is an open admin session, so it must be a deliberate choice).
- **Local model with LM Studio**: start its server, then set `LLM_BASE_URL=http://localhost:1234/v1`, `LLM_API_KEY=lm-studio` and `OPENROUTER_MODEL=<the loaded model id>`. Without any model the scenarios still run (deterministic agents).

### Rebuild the knowledge base

```bash
git clone https://github.com/CrashingGuru/ITUAIReadiness ../ITUAIReadiness
pip install -r kb/requirements.txt
python kb/build.py             # fetch, extract, chunk -> kb/chunks.json
python kb/build.py --embed     # also embed with Ollama into kb/chroma
```

The app retrieves from `kb/chunks.json` by keyword (BM25), so the runtime needs no Python. The chunks are also vectorised with the same nomic-embed-text-v1.5 model ITU uses, served by transformers.js rather than Ollama (`kb/vectors.json`, `node scripts/embed_kb.ts`); hybrid search is built but off by default (see `docs/RETRIEVAL_NOTE.md`).

## Connecting a live Sijil node

Optional. By default the Sijil panel is **simulated**. Sijil is a separate
product under its own licence; this app only calls its read-only HTTP API
(`/api/verify`, `/api/records`) and contains none of its code.

Sijil is our own attestation service (built by the team lead). It is simulated unless the live adapter is enabled with `SIJIL_BASE_URL`.

**Alignment.** Sijil is meant to measure whether a use case is aligned. It is not integrated yet, so every use case is read as aligned and no attestation is needed (`src/lib/un/alignment.ts`; nothing is written to the database, and the stored flag is left as the engine wrote it). Set `SIJIL_INTEGRATED=1` to read the stored attestation again.

1. Get Sijil from its own repository and follow its licence terms.
2. Python 3.11 venv: `python3.11 -m venv .venv && . .venv/bin/activate`, then
   `pip install fastapi httpx pyyaml cryptography reportlab uvicorn`.
3. Run the proxy against an OpenAI-compatible model endpoint (for example LM
   Studio on `http://localhost:1234/v1`), with `SIJILL_ADMIN_TOKEN` set in its
   environment, and send your agent traffic through it.
4. Its read endpoints are **unauthenticated**. Expose it over HTTPS with a
   tunnel and put authentication in front (reverse proxy checking a Bearer
   token). Never expose it bare.
5. In `.env.local` set `SIJIL_BASE_URL` (and `SIJIL_API_TOKEN` if you added
   auth; optionally `SIJIL_DISCLOSURE_RULE`). Restart, open a use case and
   press **Pull from Sijil**.

The pull verifies the hash chain first. If verification fails, nothing is
imported or filed and the panel shows `chain NOT verified`. If the node is
unreachable you get an error, never an empty pass. One run is imported per
finished task, and repeat pulls only add new tasks.

| Metric | Source |
|---|---|
| Human final approval rejects | From Sijil, **inferred**: refused/timed-out approval records plus flagged tool calls with no granted approval |
| AI disclosure rejects | From Sijil only if `SIJIL_DISCLOSURE_RULE` names a policy rule; otherwise not measured (0) |
| Actions per run | From Sijil task counters |
| Accuracy, hallucination rate, goal alignment | **Simulated.** Sijil does not measure these; reports and UI label them so |

Not yet run against a real node; the adapter is tested with a mocked `fetch`.

### Seal every pilot run (live node)

With `SIJIL_BASE_URL`, `SIJIL_AGENT_ID`, `SIJIL_AGENT_KEY` and `SIJIL_AGENT_TOKEN` all set (server side only), each pilot run is sealed into the node: one Sijil task per run, the agent's tool calls in order, then the deliverable it produced (a hash of the exact text, with whether it carried an AI disclosure). Register the agent once with `scripts/sijil_register.ts`; check the wire format with `scripts/sijil_smoke.ts` (see `docs/sijil-wire-format.md`).

- Runs are **sealed after each run**, not before each call. Prism's own gate still decides allow or reject; the node attests the record, keeps the hash chain, and applies its halt switch (with the node halted, every record seals as blocked and the pilot shows rejected calls).
- A client-facing deliverable without an AI disclosure is sealed flagged and counts against the AI-disclosure gate. Disclosure is **checked, never added**: nothing here edits the agent's text.
- If the node is unset or unreachable, the run falls back to the simulated gate and the page says so ("Simulated Sijil gate"); a fallback is never counted as sealed.
- Our agent's model calls do not go through the node, so its tool calls have no recorded model call behind them. The node's verifier flags such calls unless run in orphan-tolerant mode, so the chain check on the Pilot page can read "not verified" until the node supports that mode over HTTP.
- The hosted site cannot reach a node on a laptop. The live demo runs from a local build next to the node.

### Screen every prompt before inference (optional)

With `AGENT_LLM_BASE_URL` (the node's `/v1` URL) and `AGENT_LLM_API_KEY` set, every model call the agent makes — the ReAct reasoner, the reflector and the T12 notice drafter — goes through the Sijil node instead of straight to the provider. The node screens the exact assembled prompt against its policy **before** inference: a match on an `enforce` rule returns HTTP 403 and the run ends as `blocked_by_sijil`, with the matched rule ids and the node's record `seq` kept on the run. Blocks are counted, never fallen back: a block on a hostile or refusal-expected input counts as an attack stopped and a pass; any other block is an alignment block and fails that run. The pilot summary shows the split (`inference_blocks`), and the tuning screen shows blocks per prompt version with the `sijil_blocked` failure class and rule id. `AGENT_LLM_MODEL` and `REFLECT_LLM_MODEL` must be a model on the node's allowlist (`deepseek/deepseek-v4.1-flash` on the demo node). Unset, everything behaves exactly as before. The tuning page also carries a labelled demonstration (`POST /api/admin/un/sijil-demo`): two draft prompt versions — one with a forbidden line, one without — run through a small real pilot sample, and the page shows the real node decisions. Wording everywhere is "screened against rules and recorded": a block means a listed phrase was present, never that a prompt was proven aligned.

## Honest limits

- Sijil is simulated unless `SIJIL_BASE_URL` is set; the live adapter is untested against a real node, and accuracy, hallucination and goal alignment stay simulated either way.
- Model-driven mode was scored on S1, S2 and S4 (20 runs each; see `docs/eval/agent-results.md`, and a second model from another vendor in `docs/eval/agent-results-model2.md`). The 20/20 path match is by construction, not evidence of model judgement: an add-only guard stops model messages from changing a gate status the rules did not already address, so it shows the guard holds. An earlier version without the guard scored 0% on S2 and 35% on S4 (`docs/eval/agent-results-before-guard.md`). The three scenarios were written by the team that built the rules; a red-team set (`docs/eval/redteam-results.md`) and a way for someone outside the team to author blind scenarios (`docs/eval/blind-scenarios-howto.md`) are added, and no blind scenarios have been run yet.
- Citation validity (100%) means the cited chunk id exists in `kb/chunks.json`, not that the chunk supports the claim. Support was spot-checked with a second model as judge on 100 messages, with human labels still pending (`docs/eval/citation-support.md`).
- Fairness and bias are not evaluated: the engine gates AI use cases, it does not assess people. The Arabic evaluation is 10 queries and model-dependent. See `docs/eval/README.md` for what the evaluation does and does not show.
- Retrieval is lexical (BM25) by default, so citation relevance is uneven; some steps cite nothing by design. Arabic queries work only through LLM translation.
- Some sources are secondary (the ITU summaries; the Singapore law-firm summary, now superseded in the gap register by the IMDA framework excerpts); the DESC regulation text is not ingested. Primary global texts (IMDA, EU AI Act Arts. 14, 26, 86 and Annex III, G7 Hiroshima Code, UN System White Paper) are held as short attributed excerpts.
- A red team (50 runs, 0 permissive flips) found and fixed one real engine bug; a false `fix_declared` is still accepted on the applicant's word (it can reach `ASSISTANT_ONLY`, never a GO verdict) and owner-role events are trusted (event-source authentication is out of scope).
- Citation support (4% whole claim, 59% source link only) was labelled by a model, not a person; human labels are pending.
- The database triggers and the change log are tested as SQL text only; the suite runs no database. The 2-of-20 deployed and compliant figure exists only in the hosted demo database, not in the shipped seed.
- SOP intake reads plain text or markdown only (no PDF or Word); its parser is regex-based, and its savings come from a synthetic baseline, not a measurement.
- Inclusion (Readiness dimension 11) is partly addressed (Arabic and English with right-to-left layout, disclosure gate, a static accessibility lint); no user testing or digital-divide testing has been done.

## Licence

GNU Affero General Public License v3.0 (see `LICENSE`). Copyright (c) 2026 the PrismAI team (Shameer Thaha, Shaibi Shamsudeen).

If AGPL-3.0 does not suit your use, a separate commercial licence is available from the copyright holders; open an issue on this repository to get in touch.

## Since round one

Updated 21 Nov 2026.

- LLM-mode evaluation with a red team: S1, S2, S4 at 20 runs each, a second model, five attack types at 10 runs each, a citation-support sample (`docs/eval/`, `scripts/eval_agents.ts`).
- Live scenario editor: a judge supplies an event that runs through the same gates (`src/app/admin/federal/scenarios/`, `src/lib/un/scenario.ts`).
- KB re-embedding and new sources: 32 sources (398 chunks), 26 through ITU's pipeline functions and 6 later excerpts added with a sync script (`kb/`, `docs/RETRIEVAL_NOTE.md`).
- Multi-country compare: one process under UAE, EU AI Act and Singapore rule sets, simplified demos and not legal advice (`src/app/admin/federal/compare/`, `src/lib/un/rulesets.ts`).
- Judge mode and offline kit: read-only judges, public `/replay`, `OFFLINE=1` (`docs/final/judge-access.md`, `src/lib/un/replay.ts`).
- Arabic UI with right-to-left layout and a static accessibility lint, 0 errors and 0 warnings (`src/lib/un/i18n/dict.ts`, `docs/accessibility-check.md`).
- SOP intake: a text or markdown procedure is analysed by a deterministic reference analyzer against a synthetic baseline (fictional unit XXD), and can be promoted to a governed use case (`src/lib/un/sop/`, `src/app/admin/federal/sop/`, `data/sop/`).
- Standards note: a draft ITU-T input on the five-step verdict and the trace record (`docs/standards-note.md`).
