import { ROLES, type AgentDeps } from "./agents.ts";
import { hitlBreaches, type HitlConfig, type HitlFacts, type HitlRuleId } from "./hitl.ts";
import { computeDashboard, type Dashboard, type Policy, type UnUseCaseState, type Verdict } from "./model.ts";
import { type RoleId } from "./policy.ts";
import { searchChunks, type Chunk } from "./kb.ts";
import { type AgentMessage, type CaseState } from "./protocol.ts";
import { runRound, type RoutedEvent } from "./round.ts";
import { appendTrace, roundBodies, type TraceRecord } from "./trace.ts";

// Staged scenarios. Events are released one step at a time (never all at
// once), each to a subset of roles. State is plain JSON so a run can be saved
// between "next step" clicks and replayed from its log.

export interface GateScenario {
  kind: "gate";
  id: string;
  title: string;
  ext_id: string;
  clientFacing: boolean;
  requested: CaseState["requested"];
  steps: { step: string; events: RoutedEvent[]; expected: Verdict }[];
}

export type PortfolioAction =
  | { type: "policy_configured" }
  | { type: "entity_reports"; ids: string[] }
  | { type: "attestation"; failed: string[] }
  | { type: "policy_update"; sector: string; note: string };

export interface PortfolioScenario {
  kind: "portfolio";
  id: string;
  title: string;
  steps: { step: string; recipients: RoleId[]; action: PortfolioAction; expected: string }[];
}

export type Scenario = GateScenario | PortfolioScenario;

export interface StepResult {
  step: string;
  released_at: string;
  events: RoutedEvent[];
  /** Verdict (gate scenarios) or dashboard summary (portfolio scenarios). */
  outcome: string;
  expected: string;
  match: boolean;
  reasons: string[];
  trace_ids: string[];
  active: RoleId[];
}

export interface RunState {
  run_id: string;
  scenario_id: string;
  next: number;
  msg_seq: number;
  steps: StepResult[];
  log: TraceRecord[];
  // gate scenarios
  state?: CaseState;
  thread?: AgentMessage[];
  /** HITL rules declared unmet so far (events with `hitl`); breaches are derived from these each step. */
  hitl_unmet?: HitlRuleId[];
  /** New runs also write append-only un_trace_records rows (C4-2); older runs keep only the jsonb log. */
  trace_rows?: boolean;
  // portfolio scenarios: a sandbox copy, never the live table
  cases?: UnUseCaseState[];
  policy?: Policy;
  done: boolean;
}

export interface RunEnv {
  now: () => string;
  chunks: Chunk[];
  llm?: AgentDeps["llm"];
  /** The entity's HITL configuration and the use case's facts (I-2). Default:
   * every rule on, facts from the scenario (client-facing as declared). */
  hitl?: { config: HitlConfig; entity: string; facts: HitlFacts };
}

export const fmt = (d: Dashboard) =>
  `deployed ${d.deployed}/${d.total} (${d.deployedPct}%), compliant ${d.compliant}/${d.total} (${d.compliantPct}%), target ${d.targetCount}, gap ${d.gap}`;

export function startRun(sc: Scenario, run_id: string, opts: { cases?: UnUseCaseState[]; policy?: Policy } = {}): RunState {
  const base = { run_id, scenario_id: sc.id, next: 0, msg_seq: 0, steps: [], log: [], done: false, trace_rows: true };
  if (sc.kind === "gate") {
    return { ...base, state: { ext_id: sc.ext_id, clientFacing: sc.clientFacing, requested: "ASSISTANT_ONLY", gates: {} }, thread: [] };
  }
  if (!opts.cases?.length || !opts.policy) throw new Error("A portfolio scenario needs the use cases and the policy");
  // Sandbox copy with a clean slate so the scenario starts from 0 deployed.
  return { ...base, policy: opts.policy, cases: opts.cases.map((c) => ({ ...c, verdict: null, compliant: false })) };
}

const traceIds = (log: TraceRecord[], from: number) => log.slice(from).map((r) => r.trace_id);

/** Release the next step. Pure: returns a new RunState. */
export async function nextStep(sc: Scenario, run: RunState, env: RunEnv): Promise<RunState> {
  if (run.done || run.next >= sc.steps.length) return { ...run, done: true };
  return sc.kind === "gate" ? gateStep(sc, run, env) : portfolioStep(sc, run, env);
}

async function gateStep(sc: GateScenario, run: RunState, env: RunEnv): Promise<RunState> {
  const def = sc.steps[run.next];
  const at = env.now();
  let seq = run.msg_seq;
  const deps: AgentDeps = {
    search: (q) => searchChunks(env.chunks, q, { k: 4, mix: true }),
    nextId: () => `m${++seq}`,
    llm: env.llm,
  };
  const byId = new Map(env.chunks.map((c) => [c.chunk_id, c]));
  // I-2: breaches are computed from the declared-unmet rules and enforced by decide().
  const unmet = new Set<HitlRuleId>(run.hitl_unmet ?? []);
  for (const e of def.events) {
    if (!e.hitl) continue;
    if (e.hitl.met) unmet.delete(e.hitl.rule);
    else unmet.add(e.hitl.rule);
  }
  const h = env.hitl ?? { config: {}, entity: sc.ext_id, facts: { client_facing: sc.clientFacing, affects_rights: false, irreversible: false } };
  const breaches = hitlBreaches(h.config, h.entity, h.facts, [...unmet]);
  const r = await runRound(
    { state: { ...run.state!, hitlBreaches: breaches }, title: sc.title, requested: run.next === 0 ? sc.requested : undefined, thread: run.thread!, events: def.events },
    deps,
    (id) => byId.has(id),
  );
  const verdictMsg = r.thread[r.thread.length - 1];
  const before = run.log.length;
  const bodies = roundBodies({
    run_id: run.run_id, step: def.step, at, accepted: r.accepted, rejected: r.rejected,
    verdict: r.decision.verdict, reasons: r.decision.reasons, verdictMsg,
    chunkOf: (id) => byId.get(id),
    seen: (role) => def.events.filter((e) => e.recipients.includes(role)).map((e) => e.id),
    firstId: before + 1,
    hitlBreaches: breaches,
  });
  const log = bodies.reduce(appendTrace, run.log);
  return {
    ...run, log, state: r.state, thread: r.thread, msg_seq: seq, hitl_unmet: [...unmet], next: run.next + 1,
    done: run.next + 1 >= sc.steps.length,
    steps: [...run.steps, {
      step: def.step, released_at: at, events: def.events, outcome: r.decision.verdict, expected: def.expected,
      match: r.decision.verdict === def.expected, reasons: r.decision.reasons, trace_ids: traceIds(log, before), active: r.active,
    }],
  };
}

function portfolioStep(sc: PortfolioScenario, run: RunState, env: RunEnv): RunState {
  const def = sc.steps[run.next];
  const at = env.now();
  let cases = run.cases!;
  const policy = run.policy!;
  const a = def.action;
  let summary: string;
  let cite: Chunk | undefined;
  if (a.type === "policy_configured") {
    summary = `Policy "${policy.name}" configured: ${policy.target_percent}% target`;
  } else if (a.type === "entity_reports") {
    cases = cases.map((c) => (a.ids.includes(c.ext_id) ? { ...c, verdict: "GO_SUPERVISED" as Verdict, stage: "deployed" as const } : c));
    const per = new Map<string, number>();
    cases.filter((c) => a.ids.includes(c.ext_id)).forEach((c) => per.set(c.entity, (per.get(c.entity) ?? 0) + 1));
    summary = `Entities report ${a.ids.length} use cases deployed (${[...per].map(([e, n]) => `${e} ${n}`).join(", ")})`;
  } else if (a.type === "attestation") {
    cases = cases.map((c) => (c.verdict ? { ...c, compliant: !a.failed.includes(c.ext_id) } : c));
    summary = `Sijil attestation this week: ${a.failed.length} of ${cases.filter((c) => c.verdict).length} deployed fail (${a.failed.join(", ")})`;
  } else {
    cite = searchChunks(env.chunks, "Phase One federal services categories citizens residents business sector", { k: 1 })[0]?.chunk;
    summary = `Policy update: ${a.note}`;
  }
  const d = computeDashboard(policy, cases);
  const rescore = a.type === "policy_update" ? cases.filter((c) => c.entity_sector === a.sector).map((c) => c.ext_id) : [];
  const outcome = fmt(d) + (rescore.length ? `; re-score ${rescore.join(", ")}` : "");
  const evId = `${sc.id}-${def.step}`;
  const agent = def.recipients[0];
  const body = {
    run_id: run.run_id, step: def.step, agent, role_mandate: ROLES[agent].mandate, inputs_seen: [evId],
    claims: [{ text: summary, evidence: [evId] }],
    kb_citations: cite ? [{ chunk_id: cite.chunk_id, quote: cite.text.slice(0, 200) }] : [],
    proposal: null, confidence: "high" as const, disposition: "accepted", message: null, derived_from: [], timestamp: at,
  };
  const before = run.log.length;
  let log = appendTrace(run.log, body);
  log = appendTrace(log, {
    ...body, agent: "coordinator", inputs_seen: [log[log.length - 1].trace_id],
    claims: [{ text: outcome, evidence: [log[log.length - 1].trace_id] }], kb_citations: [],
    proposal: outcome, disposition: "dashboard", derived_from: [log[log.length - 1].trace_id],
  });
  const event: RoutedEvent = { id: evId, type: a.type, summary, recipients: def.recipients };
  return {
    ...run, log, cases, next: run.next + 1, done: run.next + 1 >= sc.steps.length,
    steps: [...run.steps, {
      step: def.step, released_at: at, events: [event], outcome, expected: def.expected, match: outcome === def.expected,
      reasons: [summary], trace_ids: traceIds(log, before), active: def.recipients,
    }],
  };
}
