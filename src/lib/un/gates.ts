import { GATES, decide, type Decision, type GateState, type GateStatus, type Requested } from "./policy.ts";
import type { GateDef, GateId } from "./governance.ts";
import { metricStatus, parseGateDef, simulatedMetric } from "./governance.ts";
import type { HitlFacts } from "./hitl.ts";
import { resolve, UAE_FEDERAL, type RuleSet } from "./rulesets.ts";
import { appendEntry, verifyChain, type ChainEntry } from "./tuning.ts";

// Effective gates = the rule set's gates + the use case's own added gates, computed whenever a verdict runs
// and recorded on the trace with the reason each applies. Add-only: a use case can never drop a rule-set gate;
// a waiver is a governance action (named approver, reason, log entry) and stays visible. Every change to the
// gate catalog, a use case's gates or a waiver is an entry in one hash-chained gate log per organisation, and
// the state below is replayed from that log. Pure: no I/O.

export type GovKind = "gate_added" | "gate_changed" | "use_case_gate" | "waiver" | "rerun";
export type GovEntry = ChainEntry<GovKind>;

export interface CustomGate { def: GateDef; version: number; by: string; at: string; signed_off_by: string }
export interface AddedGate { gate: GateId; reason: string; source: "requirement" | "task" | "admin"; by: string; at: string }
export interface Waiver { gate: GateId; approver: string; reason: string; by: string; at: string }
export interface GovState {
  custom: Record<GateId, CustomGate>;
  /** keyed by use case ext id */
  added: Record<string, AddedGate[]>;
  waivers: Record<string, Waiver[]>;
}
export const EMPTY_GOV: GovState = { custom: {}, added: {}, waivers: {} };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Replays the gate log into the current state. Later entries win; nothing is ever deleted. */
export function replayGov(entries: GovEntry[]): GovState {
  const g: GovState = { custom: {}, added: {}, waivers: {} };
  for (const e of entries) {
    const p = e.payload;
    if (e.kind === "gate_added" || e.kind === "gate_changed") {
      const parsed = parseGateDef(p.def, { custom: true });
      if (!parsed.ok) continue;
      const id = str(p.gate);
      g.custom[id] = { def: parsed.def, version: (g.custom[id]?.version ?? 0) + 1, by: e.actor, at: e.at, signed_off_by: str(p.signed_off_by) };
    } else if (e.kind === "use_case_gate") {
      const ext = str(p.ext_id);
      const list = (g.added[ext] ??= []);
      if (!list.some((a) => a.gate === p.gate)) list.push({ gate: str(p.gate), reason: str(p.reason), source: p.source as AddedGate["source"], by: e.actor, at: e.at });
    } else if (e.kind === "waiver") {
      (g.waivers[str(p.ext_id)] ??= []).push({ gate: str(p.gate), approver: str(p.approver), reason: str(p.reason), by: e.actor, at: e.at });
    }
  }
  return g;
}

export const catalogOf = (gov: GovState): Record<GateId, GateDef> => ({ ...GATES, ...Object.fromEntries(Object.entries(gov.custom).map(([id, c]) => [id, c.def])) });

export interface EffectiveGate {
  id: GateId;
  label: string;
  category: GateDef["category"];
  source: "ruleset" | "use_case";
  /** Why this gate applies to this use case. */
  reason: string;
  waiver?: { approver: string; reason: string; at: string };
}
export interface Effective {
  ruleset: RuleSet["id"];
  gates: EffectiveGate[];
  /** Effective gates beyond the shipped rule set: the "N gates added" figure. */
  added: GateId[];
  waived: GateId[];
  /** Gates that are not waived, in decide() terms. */
  useCaseGates: GateId[];
  catalog: Record<GateId, GateDef>;
  /** The rule set with admin-added requirements folded in, for decide(). */
  ruleset_effective: RuleSet;
}

const flagsOk = (d: GateDef, f: HitlFacts) => (d.requires ?? []).every((x) => (x === "affects_rights" ? !!f.affects_rights : x === "irreversible" ? !!f.irreversible : f.client_facing));

/** Computes the effective gates of one use case under one rule set. */
export function effectiveGates(o: { ext: string; facts: HitlFacts; ruleset?: RuleSet; gov?: GovState }): Effective {
  const gov = o.gov ?? EMPTY_GOV;
  const catalog = catalogOf(gov);
  const { rs: shipped } = resolve(o.ruleset ?? UAE_FEDERAL, o.facts);
  const applies = (id: GateId) => o.facts.client_facing || !catalog[id]?.clientFacingOnly;
  const shippedIds = shipped.gates.filter((g) => catalog[g] && applies(g));
  const customIds = Object.keys(gov.custom).filter((id) => !shipped.gates.includes(id) && gov.custom[id].def.rulesets?.includes((o.ruleset ?? UAE_FEDERAL).id) && flagsOk(gov.custom[id].def, o.facts) && applies(id));
  const waivers = gov.waivers[o.ext] ?? [];
  const waiverOf = (id: GateId) => {
    const w = [...waivers].reverse().find((x) => x.gate === id);
    return w ? { waiver: { approver: w.approver, reason: w.reason, at: w.at } } : {};
  };
  const gates: EffectiveGate[] = [
    ...shippedIds.map((id) => ({ id, label: catalog[id].label, category: catalog[id].category, source: "ruleset" as const, reason: `Required by ${shipped.name}`, ...waiverOf(id) })),
    ...customIds.map((id) => ({ id, label: catalog[id].label, category: catalog[id].category, source: "ruleset" as const, reason: `Required by ${shipped.name} (gate added by ${gov.custom[id].by})`, ...waiverOf(id) })),
  ];
  const own: GateId[] = [];
  for (const a of gov.added[o.ext] ?? []) {
    if (!catalog[a.gate] || gates.some((x) => x.id === a.gate)) continue;
    own.push(a.gate);
    gates.push({ id: a.gate, label: catalog[a.gate].label, category: catalog[a.gate].category, source: "use_case", reason: `Added for this use case from a ${a.source}: ${a.reason} (${a.by})`, ...waiverOf(a.gate) });
  }
  const waived = gates.filter((x) => x.waiver).map((x) => x.id);
  return {
    ruleset: (o.ruleset ?? UAE_FEDERAL).id, gates, added: [...customIds, ...own], waived, useCaseGates: own, catalog,
    ruleset_effective: { ...shipped, gates: [...shipped.gates, ...customIds] },
  };
}

/** What goes on the verdict trace record. */
export const traceGates = (e: Effective) => e.gates.map((g) => ({ id: g.id, source: g.source, reason: g.reason, ...(g.waiver ? { waived_by: g.waiver.approver, waiver_reason: g.waiver.reason } : {}) }));

/** decide() under the effective gates of the use case. Same verdict as decide() when nothing is added or waived. */
export function decideEffective(o: { ext: string; facts: HitlFacts; requested: Requested; gates: GateState; hitlBreaches?: string[]; ruleset?: RuleSet; gov?: GovState }): { decision: Decision; effective: Effective } {
  const effective = effectiveGates(o);
  const decision = decide({
    clientFacing: o.facts.client_facing, requested: o.requested, gates: o.gates, hitlBreaches: o.hitlBreaches,
    ruleset: effective.ruleset_effective, catalog: effective.catalog, useCaseGates: effective.useCaseGates, waived: effective.waived,
  });
  return { decision, effective };
}

/** Gates that stop an approval: every effective gate that is not waived must be pass. Metric gates read their value
 * from `measured` (SIMULATED until stage 2). */
export function approvalBlockers(e: Effective, gates: GateState): { id: GateId; label: string; status: GateStatus }[] {
  return e.gates.filter((g) => !g.waiver && (gates[g.id] ?? "unknown") !== "pass").map((g) => ({ id: g.id, label: g.label, status: gates[g.id] ?? "unknown" }));
}

/** Status of a metric gate from a SIMULATED measurement (labelled simulated wherever shown). */
export function metricEvidence(id: GateId, ext: string, def: GateDef): { value: number; status: "pass" | "fail" | "unknown"; simulated: true } | null {
  if (!def.metric) return null;
  const value = simulatedMetric(id, ext, def.metric);
  return { value, status: metricStatus(def.metric, value), simulated: true };
}

/** The evidence per effective gate: the run's recorded statuses, except metric gates, whose status comes from a
 * measured value against the threshold (SIMULATED until stage 2 reads Sijil and eval results). */
export function evidenceFor(e: Effective, ext: string, runGates: GateState): GateState {
  const out: GateState = { ...runGates };
  for (const g of e.gates) {
    const m = metricEvidence(g.id, ext, e.catalog[g.id]);
    if (m) out[g.id] = m.status;
  }
  return out;
}

/** Use cases whose effective gate set differs between two states, or that carry the changed gate in either
 * (so their verdicts must be re-run as new runs). */
export function affectedUseCases(ucs: { ext_id: string; facts: HitlFacts }[], before: GovState, after: GovState, changed?: GateId): string[] {
  const ids = (ext: string, facts: HitlFacts, gov: GovState) => effectiveGates({ ext, facts, gov }).gates.map((g) => g.id).sort();
  return ucs.filter((u) => {
    const a = ids(u.ext_id, u.facts, before);
    const b = ids(u.ext_id, u.facts, after);
    return a.join(",") !== b.join(",") || (!!changed && (a.includes(changed) || b.includes(changed)));
  }).map((u) => u.ext_id);
}

export const appendGov = (prev: GovEntry | null, kind: GovKind, actor: string, payload: Record<string, unknown>, at: string): GovEntry => appendEntry<GovKind>(prev, kind, actor, payload, at);
export const verifyGov = (entries: GovEntry[]) => verifyChain(entries);
