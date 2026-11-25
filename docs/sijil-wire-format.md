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
- The verifier CLI with `--allow-orphan-tool-calls` returns PASS for normal and halted runs (`records=14`). Today the node's HTTP endpoint has no way to ask for that mode (open question for the Sijil side).
