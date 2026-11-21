# Candidate ITU-T input: a five-step deployment verdict and a hash-chained agent trace record

Status: draft for discussion. Author: Shameer Thaha, Shaibi Shamsudeen (PrismAI team). Date: 21 Nov 2026. Source: the Prism hackathon implementation (`src/lib/un/model.ts`, `trace.ts`, `signature.ts`), synthetic data only.

## 1. Problem

Governments are approving AI agents for public services case by case. Two things are missing from most approvals: a common, small vocabulary for the decision itself, and a tamper-evident record of how the decision was reached. Without the first, entities cannot be compared. Without the second, a verdict cannot be audited after the fact.

## 2. Proposal A: a five-step verdict scale

A use case receives exactly one verdict, ordered from most to least autonomy:

| Verdict | Meaning |
|---|---|
| `GO_AUTONOMOUS` | May run without per-action sign-off. |
| `GO_SUPERVISED` | May run with a person approving outputs. |
| `ASSISTANT_ONLY` | Drafts only; a person acts. |
| `NO_GO` | A hard gate failed. |
| `ESCALATE` | Evidence is missing; a person must decide. |

Rules in the reference implementation (`policy.ts`, `decide()`):

1. Verdicts come from a set of named gates (for example `approved_infrastructure`, `audit_log`, `data_lawful`, `human_final_approval`, `ai_disclosure`). Each gate has a status: `pass`, `fail`, `fix_declared` (the applicant says it is fixed, not yet re-tested) or `unknown` (no evidence).
2. Precedence: a failed gate gives `NO_GO`; then declared-but-untested fixes give `ASSISTANT_ONLY`; then missing evidence gives `ESCALATE`.
3. With every gate passed, a client-facing (citizen-facing) use case is capped at `GO_SUPERVISED`, whatever autonomy was requested.
4. A breach of a human-oversight rule fails `human_final_approval` regardless of that gate's own status.
5. The verdict is computed by rules, not by a model. Models may propose gate statuses with evidence; they do not set the verdict.
6. A verdict is written to a use case only after a recorded human signature (section 4).

The scale is deliberately coarse: five values are enough to drive a portfolio count ("share of use cases deployed") and to be read by a non-specialist.

## 3. Proposal B: the trace record

Each agent contribution and each verdict is one append-only record. The record carries a concise, citable rationale (claim, evidence, quoted source text, proposal), not hidden model reasoning.

`TraceRecord` fields (from `trace.ts`):

| Field | Type | Notes |
|---|---|---|
| `trace_id` | string | `tr_` plus a six-digit sequence; must be in sequence. |
| `run_id` | string | The run (one scenario or case) the record belongs to. |
| `step` | string | The step within the run. |
| `agent` | role id | Which role (for example security, privacy, compliance, coordinator) acted. |
| `role_mandate` | string | The mandate the role operates under. |
| `inputs_seen` | string[] | What the role was shown (ids). |
| `claims` | `{text, evidence[]}[]` | Concise claims with evidence ids. |
| `kb_citations` | `{chunk_id, quote}[]` | Quoted passages from the knowledge base. |
| `proposal` | string or null | A verdict, a `gate=status` pair, or null (advice only). |
| `confidence` | `high`, `medium`, `low` | |
| `disposition` | string | `accepted`, `rejected: <why>`, `verdict`, or `signature: SIGN/WITHHOLD`. Rejections are recorded as evidence too. |
| `message` | object or null | The exact agent message, so a run can be replayed from the log alone. |
| `derived_from` | string[] | For a verdict: the `trace_id`s of the accepted records it rests on. |
| `hitl_breaches` | string[] (optional) | Unmet human-oversight rules, on verdict records only. |
| `signature` | object (optional) | Present only on the final human record (section 4). |
| `timestamp` | string | ISO 8601. |
| `prev_hash` | string | Hash of the previous record; 64 zeros for the first. |
| `hash` | string | See below. |

Hash rule: `hash = SHA-256(prev_hash || canonical_json(record without hash))`, where `canonical_json` sorts object keys at every depth, drops undefined values, and uses standard JSON encoding for values. A verifier recomputes the chain from the first record and reports the first record where the `prev_hash` link, the `trace_id` sequence or the content hash fails. This detects edits, deletions, insertions and reordering. It does not, by itself, prove who wrote the log: the head hash must be anchored somewhere the log owner cannot rewrite (see section 6).

Replay: because each accepted message is stored verbatim, a verifier can re-run the verdict rules over the accepted messages of each step and compare with the recorded verdict (`replayVerdicts`). A mismatch means the log and the rules disagree.

## 4. Human signature record

The last record of a completed run is a person's decision (`signature.ts`):

`signature = { type: "HUMAN_SIGNATURE", signer_id, role, decision: "SIGN" | "WITHHOLD", comment }`

It is chained like any record and references the verdict record in `derived_from`. A `WITHHOLD` requires a comment. The verdict, run id, head hash and signer are written to the use case only after `SIGN`. Note this is an attested decision inside a chained log, not a cryptographic digital signature; a deployment needing non-repudiation should add a signature over the head hash by a key the signer controls.

## 5. Questions for the Study Group

1. Is a five-value scale the right granularity, and should the names be normative?
2. Which gate identifiers, if any, should be standardised, and which left to jurisdictions?
3. Should the record schema be normative, or only the hash-chain rule and the verdict vocabulary?
4. How should energy and token metering be reported alongside a run? (The implementation reports tokens and seconds as measured and energy as a labelled estimate from an assumed constant.)

## 6. Related work

Signed, append-only transparency services for supply-chain and agent execution evidence are being developed in the IETF around SCITT (Supply Chain Integrity, Transparency and Trust). See the Internet-Draft on agent execution evidence using SCITT: the team lead's own Internet-Draft, "Agent Execution Evidence: A SCITT Profile for Verifiable Records of AI Agent Runs" (`draft-thaha-scitt-agent-execution-evidence-02`, individual submission, not adopted by the working group; https://datatracker.ietf.org/doc/draft-thaha-scitt-agent-execution-evidence/). Prism's trace record and Sijil's attestation are the practical counterpart of that profile; this note proposes the verdict vocabulary that sits on top of it.. The trace record here could be registered as a SCITT signed statement, with the transparency service supplying the external anchoring and non-repudiation that a hash chain alone does not.

## 7. Limitations

- The reference implementation is a hackathon prototype with synthetic data. Arabic interface strings are draft translations awaiting native-speaker review.
- The hash chain proves internal consistency only; it needs external anchoring to resist a log owner who rewrites everything.
- The verdict rules encode one jurisdiction's draft framework and are meant as an example, not as a recommended policy.
