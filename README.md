# Prism for public services: agentic AI approval and assurance

[![CI](https://github.com/devinwarp/prismai_UN_A4G/actions/workflows/ci.yml/badge.svg)](https://github.com/devinwarp/prismai_UN_A4G/actions/workflows/ci.yml)

Entry for the ITU AI for Good Hackathon (UAE). Prism governs the path from an AI
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
| Policy config, use-case CSV import, federal dashboard (deployed % beside compliant %) | `src/lib/un/model.ts`, `src/app/admin/federal/` |
| Knowledge base (22 sources, 331 chunks, SHA-256 provenance) built with ITU's code | `kb/` |
| Eight role agents, typed coordination protocol | `src/lib/un/agents.ts`, `protocol.ts`, `round.ts` |
| Deterministic policy engine: five hard gates never averaged, client-facing cap at `GO_SUPERVISED` | `src/lib/un/policy.ts` |
| Staged scenarios S1 (gate engine), S2 (voice contact centre), S3 (federal cascade) and S4 (consumer complaint escalating to a privacy breach) | `src/lib/un/scenario.ts`, `scenarios.ts` |
| Hash-chained reasoning traces, verifier, replay, trace viewer | `src/lib/un/trace.ts`, `src/app/admin/federal/runs/` |
| Sijil panel: runs, attestation, rejects per criterion, auto-filed pilot reports | `src/lib/un/sijil.ts`, `src/app/admin/federal/use-cases/` |
| Per-entity human-in-the-loop rules (breach = hard-gate failure) | `src/lib/un/hitl.ts`, `src/app/admin/federal/HitlEditor.tsx` |

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
npm ci
npm run dev                    # http://localhost:3000 -> /admin/federal
npm test                       # unit tests (no database needed)
```

Sign in with an email in `ADMIN_EMAILS`, open **Federal**, import
`data/un-use-cases.csv`, then **Run a staged scenario**.

### Rebuild the knowledge base

```bash
git clone https://github.com/CrashingGuru/ITUAIReadiness ../ITUAIReadiness
pip install -r kb/requirements.txt
python kb/build.py             # fetch, extract, chunk -> kb/chunks.json
python kb/build.py --embed     # also embed with Ollama into kb/chroma
```

The app retrieves from `kb/chunks.json` by keyword (BM25), so the runtime needs no Python. The chunks are also vectorised with ITU's `embed_texts` and model (`kb/vectors.json`); hybrid search is built but off by default (see `docs/RETRIEVAL_NOTE.md`).

## Connecting a live Sijil node

Optional. By default the Sijil panel is **simulated**. Sijil is a separate
product under its own licence; this app only calls its read-only HTTP API
(`/api/verify`, `/api/records`) and contains none of its code.

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

## Honest limits

- Sijil is simulated unless `SIJIL_BASE_URL` is set; the live adapter is untested against a real node, and accuracy, hallucination and goal alignment stay simulated either way.
- Agents were evaluated in their deterministic mode; model-driven mode is built, not yet scored.
- Retrieval is lexical, so citation relevance is uneven; some steps cite nothing by design.
- Some sources are secondary (PDPL via a UAE portal summary, the Singapore framework via a law-firm summary); the DESC regulation text is not ingested.
- Inclusion (Readiness dimension 11) and multilingual service are not addressed.

## Licence

GNU Affero General Public License v3.0 (see `LICENSE`). Copyright (c) 2026 the PrismAI team (Shameer Thaha, Shaibi Shamsudeen).

If AGPL-3.0 does not suit your use, a separate commercial licence is available from the copyright holders; open an issue on this repository to get in touch.
