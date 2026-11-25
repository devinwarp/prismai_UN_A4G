# Sijil agent wire format (proved against a local node, 25 Nov 2026)

What `scripts/sijil_smoke.ts` proved against `sijil-foundationflow` (Python node, closed policy, no rule pack). Later tasks use these facts, not the design doc where they differ.

## Handshake
- Every `/api/agent/*` call needs header `X-Sijil-Token` (the node's `SIJILL_TOKEN`).
- Canonical JSON: sorted keys, `,` and `:` separators, no spaces, non-ASCII kept as is.
- Proof = Ed25519 signature over the 32 raw bytes of `sha256(canonicalJson(msg))`, sent as hex.
- Register (once per agent, `Authorization: Bearer <admin token>`): `POST /api/agent/challenge {agent_id, purpose:"register"}` returns `{nonce}`; `POST /api/agent/register {agent_id, agent_pubkey (32 bytes hex), nonce, registered_by, self_proof}` where `self_proof` signs `{agent_id, agent_pubkey, nonce, registered_by}`. `agent_id` is `spiffe://<domain>/agent/<name>`; `registered_by` is a principal such as `local:<64 hex>`.
- Session (per process): challenge with `purpose:"session"`, then `POST /api/agent/session {agent_id, nonce, proof}` where `proof` signs `{agent_id, node_id, nonce, purpose:"session"}`; `node_id` comes from `GET /api/policy`. Returns `{agent_session, expires_at, ...}`. Send `X-Sijil-Agent-Session` on later calls. The session is bound to the caller's address.
- `POST /api/agent/task/start {intent_hash (64 hex), harness, session_id}` returns `{seq, record_hash}`. `harness` must be one of `claude-code, codex, cursor, gemini-cli, foundry, http-agent, other`; we use `http-agent`.
- `POST /api/agent/task/end {outcome: "completed", task_seq}` returns the sealed counts (`tool_calls`, `blocked`, `flagged`, `last_seq`, ...).

## Sealing a record
`POST /api/agent/seal {type:"tool_call", rulepack_hash:"", decision, mode, input_hash, rule_hits:[], ext:{harness, session_id, tool, server, qualified, correlation:"none", observed_by:"mcp_guard", summary}}` returns `{seq, record_hash, ts, decision, task_seq}`. The returned `decision` is the sealed one.
- `source_label` is **forbidden** on `tool_call` (only `tool_result`), and must match a fixed enum. "ai-generated" cannot be a source label: the AI marker goes in `ext.summary` (a string).
- `observed_by` must be one of `mcp_guard, claude_code_hook, egress_proxy, http_adapter, foundry_relay`. `http_adapter` adds shape rules (a `http:` qualified name and a `summary` object); we use `mcp_guard`.
- `rule_hits` ids that are Sijil's own (reserved) are refused; a custom id such as `prism:ai_disclosure_missing` is accepted.
- `correlation:"none"` lets a `tool_call` be sealed with no parent model-call record (an "orphan").
- A deliverable is sealed as a `tool_call` named `deliver_output`, `input_hash` = sha256 of the exact text.
- **Do not set `ext.after_the_fact`.** The node forces `block`/`enforce` under halt, and the verifier rejects an after-the-fact record that claims enforcement. Without the flag both normal and halted runs verify. Say in `summary` that the record was sealed after the run.
- A decision of `block` with `mode:"enforce"` is only for what the node itself enforces (halt). Our own gate's rejects and a deliverable missing its disclosure are sealed as `flag` / `record`, with a `prism:` rule hit.
- Halt (`POST /api/admin/halt {"halted": true}`, admin token) makes the node seal every call `block`; confirmed (3 of 3 records).

## Verifying
- `GET /api/verify` returns `{ok, exit_code, output}`. It runs the verifier **without** orphan mode, so it reports `ok:false` ("tool_call without parent inference") as soon as any orphan call is sealed. That is expected for our agent, whose model calls do not go through Sijil.
- The verifier CLI with `--allow-orphan-tool-calls` returns PASS for normal and halted runs (`records=14`). The node's `GET /api/verify?allow_orphan_tool_calls=1` does the same (confirmed 25 Nov); `verifyChain` and `pullLive` both ask for it, so the panel's pull verifies instead of reporting a false `tool_call without parent inference`.

## End-to-end result (25 Nov 2026, `scripts/sijil_pilot_check.ts --sample 8`, real rule-based agent, local node)
- **Sealed:** 36 runs, 208 records sealed (tool calls plus 7 deliverables); every deliverable's stored hash equals the sha256 of its message text; the node's verifier CLI with `--allow-orphan-tool-calls` PASSes the whole chain (857 records after all four cases). The node's `GET /api/verify` reads `ok:false` ("tool_call without parent inference") because it has no orphan-tolerant mode: the Pilot page then says "chain NOT verified" with that reason. Open item for the Sijil side.
- **Missing disclosure** (`--no-disclosure`, a deliberate fixture that strips the AI sentence before the run is recorded): the client-facing deliverable seals `flag` with `prism:ai_disclosure_missing`; the disclosure measure reads 0 of 1, so the `ai_disclosure` gate fails. Nothing was added to any text.
- **Halted** (`scripts/sijil_halt.ts on`): all 208 records seal `block`, `halted: true`, the pilot's rejected calls rise to 200, the deliverable decision is `block`. `off` resumes.
- **Node stopped:** the pilot completes; every run falls back (`source: simulated`, reason "Sijil node unreachable"); nothing is counted as sealed.

## Pre-inference screening (agent calls through the node)

With `AGENT_LLM_BASE_URL` set to the node's `/v1` URL, the agent's model calls (ReAct reasoner, reflector, T12 notice drafter) are sent to `POST /v1/chat/completions` on the node instead of straight to the provider. The node screens the exact assembled prompt (system + messages) against its policy **before** forwarding to the upstream model.

- **Allow:** the node proxies the request; the reply is a normal OpenAI chat-completion JSON.
- **Block:** HTTP 403 with body `{"error":{"type":"policy_block","code":"sijill_block"},"sijill":{"seq","decision":"block","rule_hits":[...],"record_hash"}}` and headers `X-Sijill-Seq`, `X-Sijill-Decision`, `X-Sijill-Record-Hash`. `src/lib/llm.ts` recognises this shape and throws `SijilBlockedError { rules, seq, recordHash }` — distinct from an auth 403 (`LlmHttpError`), never retried, never fallen back.
- A blocked run ends `blocked_by_sijil`: `runCase` returns a `verdict:"blocked"` outcome whose `result.output.status` is `blocked_by_sijil` and whose failures carry the class `sijil_blocked:<rule ids>`. `toPilotRun` marks the run `status:"blocked_by_sijil"` with `sijil_blocks:[{rules,seq,attack}]`; a block on a refusal-expected or hostile/injection case is an attack stopped and a pass, any other block is an alignment block and fails the run. `plan.inference_blocks` summarises `{total, attacks_stopped, alignment, by_rule}`.
- The node's allowlist accepts only `deepseek/deepseek-v4.1-flash` for this attestation (`api:openrouter:deepseek/deepseek-v4.1-flash`); `AGENT_LLM_MODEL`/`REFLECT_LLM_MODEL` must match or every call blocks.
- Local check: `scripts/sijil_inference_check.ts` against a node started with a fake upstream (see the plan `docs/superpowers/plans/2026-11-25-sijil-pre-inference-screening.md`, Task 8).

## Whole-loop check (25 Nov 2026, `scripts/sijil_loop_check.ts`)

One pilot run against a local node (`deploy/render/policy.yaml`, `attestation: api`, fake upstream on :8791, fresh `DATABASE_PATH`, agent registered via `scripts/sijil_register.ts`) exercises all three legs at once: every model call screened on `/v1` (allowed — the stub upstream answers), each run's tool calls and deliverable sealed through `/api/agent/*` (3 runs, 17 records, all `node:` source), `verifyChain` ok, and `pullLive` verified with the sealed runs pulled back. PASS.
