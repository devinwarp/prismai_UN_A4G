// Sijil as inference-level attestation. Every tool call the agent attempts passes
// through Sijil, which allows or rejects it against the agent's authorisations.
// What Prism reads from it is simple and countable: how many calls were made and
// how many were rejected (an unauthorised or misaligned action). Output quality
// (right answer, hallucination) is NOT a Sijil measure; the eval harness grades that.
//
// Two sources share one shape: the simulated gate below (demo, tests) and records
// pulled from a live Sijil node (statsFromRecords). Pure; no I/O.

export interface ToolCall {
  tool: string;
  args: Record<string, string | number | boolean>;
}

export type RejectReason = "tool_not_authorised" | "human_release_missing";

export interface CallDecision {
  call: ToolCall;
  decision: "allow" | "reject";
  reason?: RejectReason;
}

export interface SijilCallStats {
  calls: number;
  rejected: number;
  /** rejected / calls; 0 when there were no calls. */
  reject_rate: number;
  by_reason: Record<string, number>;
  by_tool: Record<string, number>;
  /** "simulated" or "live:<node id>". */
  source: string;
}

/** Tools that reach a citizen and so need a recorded human release before Sijil lets them through. */
export const NEEDS_HUMAN_RELEASE = ["send_customer_message"];

/** The simulated Sijil gate: allow only authorised tools; a citizen-facing send also needs a human release. */
export function simulatedGate(call: ToolCall, allowlist: string[]): CallDecision {
  if (!allowlist.includes(call.tool)) return { call, decision: "reject", reason: "tool_not_authorised" };
  if (NEEDS_HUMAN_RELEASE.includes(call.tool) && call.args.human_released !== true) {
    return { call, decision: "reject", reason: "human_release_missing" };
  }
  return { call, decision: "allow" };
}

const r4 = (x: number) => Math.round(x * 10000) / 10000;

export function statsFromDecisions(ds: CallDecision[], source = "simulated"): SijilCallStats {
  const rejected = ds.filter((d) => d.decision === "reject");
  const by_reason: Record<string, number> = {};
  const by_tool: Record<string, number> = {};
  for (const d of rejected) {
    by_reason[d.reason ?? "unspecified"] = (by_reason[d.reason ?? "unspecified"] ?? 0) + 1;
    by_tool[d.call.tool] = (by_tool[d.call.tool] ?? 0) + 1;
  }
  return { calls: ds.length, rejected: rejected.length, reject_rate: ds.length ? r4(rejected.length / ds.length) : 0, by_reason, by_tool, source };
}

/** Add stats from several runs (counts add; the rate is recomputed). */
export function addStats(all: SijilCallStats[], source = "simulated"): SijilCallStats {
  const by_reason: Record<string, number> = {};
  const by_tool: Record<string, number> = {};
  let calls = 0;
  let rejected = 0;
  for (const s of all) {
    calls += s.calls;
    rejected += s.rejected;
    for (const [k, v] of Object.entries(s.by_reason)) by_reason[k] = (by_reason[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.by_tool)) by_tool[k] = (by_tool[k] ?? 0) + v;
  }
  return { calls, rejected, reject_rate: calls ? r4(rejected / calls) : 0, by_reason, by_tool, source };
}

/** Decision values a live Sijil node uses for a refused call. ASSUMPTION: the node's
 * exact vocabulary is not documented here, so this is the one place to adjust it.
 * "flag" (needs a human) is deliberately not a rejection. */
export const LIVE_REJECT_DECISIONS = ["deny", "denied", "reject", "rejected", "block", "blocked"];

export interface LiveRecord {
  type: string;
  decision?: string;
  ext?: Record<string, unknown> | null;
}

/** Stats from records of a verified live node: one call per tool_call record, rejected when its decision is a refusal. */
export function statsFromRecords(records: LiveRecord[], nodeId: string): SijilCallStats {
  const ds: CallDecision[] = records
    .filter((r) => r.type === "tool_call")
    .map((r) => {
      const tool = typeof r.ext?.tool === "string" ? r.ext.tool : "unknown";
      const refused = LIVE_REJECT_DECISIONS.includes(String(r.decision ?? "").toLowerCase());
      return { call: { tool, args: {} }, decision: refused ? "reject" : "allow" } satisfies CallDecision;
    });
  return statsFromDecisions(ds, `live:${nodeId}`);
}
