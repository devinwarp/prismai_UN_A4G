import { createHash } from "node:crypto";
import { excerpt, type Chunk } from "./kb.ts";
import { ROLES } from "./agents.ts";
import type { Verdict } from "./model.ts";
import { GATES, type RoleId } from "./policy.ts";
import { reconcile, type AgentMessage, type CaseState, type Rejection } from "./protocol.ts";

// Append-only, hash-chained reasoning trace. Records hold a concise, citable
// rationale (claim, evidence, quoted chunks, proposal), never hidden model
// reasoning. hash = sha256(prev_hash + canonical_json(record without hash)).
export interface TraceRecord {
  trace_id: string;
  run_id: string;
  step: string;
  agent: RoleId;
  role_mandate: string;
  inputs_seen: string[];
  claims: { text: string; evidence: string[] }[];
  kb_citations: { chunk_id: string; quote: string }[];
  /** What the agent proposes: a verdict, a gate status, or null (advice only). */
  proposal: string | null;
  confidence: "high" | "medium" | "low";
  /** "accepted" | "rejected: <why>" | "verdict". */
  disposition: string;
  /** The exact message, so a run can be replayed from the log alone. */
  message: AgentMessage | null;
  /** For a verdict: the trace ids of the accepted records it rests on. */
  derived_from: string[];
  /** Verdict records only, and only when non-empty: the unmet HITL rules (I-2) that failed human_final_approval. */
  hitl_breaches?: string[];
  /** Present only on the final human signature record (I-4). */
  signature?: HumanSignature;
  timestamp: string;
  prev_hash: string;
  hash: string;
}

export interface HumanSignature {
  type: "HUMAN_SIGNATURE";
  signer_id: string;
  role: string;
  decision: "SIGN" | "WITHHOLD";
  comment: string;
}

export const GENESIS = "0".repeat(64);

/** Stable JSON: keys sorted at every depth, so a re-serialised record hashes alike. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

export const recordHash = (prev: string, r: Omit<TraceRecord, "hash">) =>
  createHash("sha256").update(prev + canonical(r), "utf8").digest("hex");

export type Body = Omit<TraceRecord, "trace_id" | "prev_hash" | "hash">;

/** Pure append: returns a new log. */
export function appendTrace(log: TraceRecord[], body: Body): TraceRecord[] {
  const prev_hash = log.length ? log[log.length - 1].hash : GENESIS;
  const rec = { ...body, trace_id: `tr_${String(log.length + 1).padStart(6, "0")}`, prev_hash };
  return [...log, { ...rec, hash: recordHash(prev_hash, rec) }];
}

export interface Verification {
  ok: boolean;
  length: number;
  /** Index of the first bad record, if any. */
  brokenAt: number | null;
  reason: string | null;
}

/** Recompute the whole chain. Detects edits, deletions, insertions, reordering. */
export function verifyLog(log: TraceRecord[]): Verification {
  let prev = GENESIS;
  for (let i = 0; i < log.length; i++) {
    const { hash, ...rest } = log[i];
    if (rest.prev_hash !== prev) return { ok: false, length: log.length, brokenAt: i, reason: "prev_hash does not match the previous record (record removed, inserted or reordered)" };
    if (rest.trace_id !== `tr_${String(i + 1).padStart(6, "0")}`) return { ok: false, length: log.length, brokenAt: i, reason: "trace_id out of sequence" };
    if (recordHash(prev, rest) !== hash) return { ok: false, length: log.length, brokenAt: i, reason: "record content does not match its hash (edited)" };
    prev = hash;
  }
  return { ok: true, length: log.length, brokenAt: null, reason: null };
}

const proposalOf = (m: AgentMessage): string | null =>
  m.type === "PROPOSE" ? m.requested ?? null : m.gate && m.status ? `${m.gate}=${m.status}` : null;

/** Trace bodies for one coordinator round: an entry per accepted message, per
 * rejection (rejections are evidence too), then the verdict that cites them. */
export function roundBodies(opts: {
  run_id: string;
  step: string;
  at: string;
  accepted: AgentMessage[];
  rejected: Rejection[];
  verdict: Verdict;
  reasons: string[];
  verdictMsg: AgentMessage;
  chunkOf: (id: string) => Chunk | undefined;
  seen: (role: RoleId) => string[];
  firstId: number;
  hitlBreaches?: string[];
}): Body[] {
  const cite = (m: AgentMessage) =>
    m.kb.flatMap((id) => {
      const c = opts.chunkOf(id);
      return c ? [{ chunk_id: id, quote: excerpt(c.text, `${m.gate ? GATES[m.gate].kbQuery : ROLES[m.from].kbQuery} ${m.reason}`) }] : [];
    });
  const base = (m: AgentMessage) => ({
    run_id: opts.run_id,
    step: opts.step,
    agent: m.from,
    role_mandate: ROLES[m.from].mandate,
    inputs_seen: opts.seen(m.from),
    timestamp: opts.at,
  });
  const out: Body[] = [];
  for (const m of opts.accepted) {
    out.push({ ...base(m), claims: [{ text: m.reason, evidence: m.evidence }], kb_citations: cite(m), proposal: proposalOf(m), confidence: m.evidence.length && m.kb.length ? "high" : "medium", disposition: "accepted", message: m, derived_from: [] });
  }
  for (const { msg, why } of opts.rejected) {
    out.push({ ...base(msg), claims: [{ text: msg.reason, evidence: msg.evidence }], kb_citations: [], proposal: proposalOf(msg), confidence: "low", disposition: `rejected: ${why}`, message: msg, derived_from: [] });
  }
  // trace ids of the accepted records are firstId, firstId+1, ... in order
  const acceptedIds = opts.accepted.map((_, i) => `tr_${String(opts.firstId + i).padStart(6, "0")}`);
  out.push({
    ...base(opts.verdictMsg),
    inputs_seen: acceptedIds,
    claims: opts.reasons.map((text) => ({ text, evidence: acceptedIds })),
    kb_citations: [],
    proposal: opts.verdict,
    confidence: "high",
    disposition: "verdict",
    message: opts.verdictMsg,
    derived_from: acceptedIds,
    ...(opts.hitlBreaches?.length ? { hitl_breaches: opts.hitlBreaches } : {}),
  });
  return out;
}

/** Re-derive every verdict from the accepted messages in the log and compare
 * with what was recorded: a run replays from its log alone. */
export function replayVerdicts(log: TraceRecord[], initial: CaseState, hasChunk: (id: string) => boolean): { ok: boolean; mismatches: string[] } {
  let state = initial;
  const mismatches: string[] = [];
  const steps = [...new Set(log.map((r) => r.step))];
  for (const step of steps) {
    const rows = log.filter((r) => r.step === step);
    const accepted = rows.filter((r) => r.disposition === "accepted" && r.message).map((r) => r.message!);
    const breaches = rows.find((x) => x.disposition === "verdict")?.hitl_breaches;
    const r = reconcile({ ...state, hitlBreaches: breaches ?? [] }, accepted, hasChunk);
    state = r.state;
    const recorded = rows.find((x) => x.disposition === "verdict")?.proposal;
    if (recorded && recorded !== r.decision.verdict) mismatches.push(`${step}: log says ${recorded}, replay gives ${r.decision.verdict}`);
  }
  return { ok: mismatches.length === 0, mismatches };
}
