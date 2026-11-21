import type { HitlFacts, HitlRuleId } from "./hitl.ts";
import { HITL_RULE_IDS } from "./hitl.ts";
import type { RuleSet } from "./rulesets.ts";
import seed from "../../../data/un-governance.json" with { type: "json" };

// Governance as data. The shipped nine gates and three rule sets are seeded from
// data/un-governance.json; admin-added gates arrive through the hash-chained gate
// log (gates-log.ts). Pure: no I/O. The validators below are the only way a gate
// definition enters the system, from the seed or from an admin.

export const ROLE_IDS = ["innovator", "policy_adviser", "security", "privacy", "compliance", "frontline", "finance", "coordinator"] as const;
export type RoleId = (typeof ROLE_IDS)[number];
/** A gate id. The shipped nine are BuiltinGateId; an admin may add more. */
export type GateId = string;
export type GateCategory = "functional" | "non-functional";
export const CATEGORIES: GateCategory[] = ["functional", "non-functional"];
/** Where the evidence for the gate comes from. "metric" gates carry a measured value and a threshold. */
export const EVIDENCE_SOURCES = ["reviewer", "sijil", "eval", "metric"] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];
/** Risk flags a gate's applicability can depend on. */
export const FLAGS = ["client_facing", "affects_rights", "irreversible"] as const;
export type Flag = (typeof FLAGS)[number];
export type RuleSetId = RuleSet["id"];
export const RULESET_IDS: RuleSetId[] = ["uae-federal", "eu-ai-act", "sg-imda"];

export interface MetricSpec {
  name: string;
  op: "<=" | ">=";
  threshold: number;
  unit: string;
  /** Stage 2 reads Sijil and eval results; until then the value is SIMULATED and labelled so. */
  source: "simulated";
}

export interface GateDef {
  label: string;
  owner: RoleId;
  clientFacingOnly: boolean;
  kbQuery: string;
  optional?: boolean;
  category: GateCategory;
  evidence: EvidenceSource;
  /** Risk flags that must all be true for the gate to apply (admin-added gates). */
  requires?: Flag[];
  /** Admin-added only: rule sets that require this gate (on top of their shipped list). */
  rulesets?: RuleSetId[];
  metric?: MetricSpec;
  /** True for an admin-added gate; the shipped nine are not editable. */
  custom?: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
export const ID_RE = /^[a-z][a-z0-9_]{2,40}$/;

/** Validates a gate definition from untrusted input. Returns the clean definition or the first problem. */
export function parseGateDef(raw: unknown, opts: { custom: boolean }): { ok: true; def: GateDef } | { ok: false; error: string } {
  if (!isObj(raw)) return { ok: false, error: "gate must be an object" };
  const bad = (error: string) => ({ ok: false as const, error });
  if (!isStr(raw.label, 200)) return bad("label is required (up to 200 characters)");
  if (!(ROLE_IDS as readonly unknown[]).includes(raw.owner) || raw.owner === "coordinator") return bad("owner must be a role that can own a gate");
  if (!(CATEGORIES as unknown[]).includes(raw.category)) return bad("category must be functional or non-functional");
  if (!(EVIDENCE_SOURCES as readonly unknown[]).includes(raw.evidence)) return bad(`evidence must be one of ${EVIDENCE_SOURCES.join(", ")}`);
  const requires = raw.requires === undefined ? [] : raw.requires;
  if (!Array.isArray(requires) || !requires.every((f) => (FLAGS as readonly unknown[]).includes(f))) return bad(`requires must list risk flags from ${FLAGS.join(", ")}`);
  const rulesets = raw.rulesets === undefined ? [] : raw.rulesets;
  if (!Array.isArray(rulesets) || !rulesets.every((r) => (RULESET_IDS as unknown[]).includes(r))) return bad(`rulesets must list rule sets from ${RULESET_IDS.join(", ")}`);
  const kbQuery = raw.kbQuery === undefined ? raw.label : raw.kbQuery;
  if (!isStr(kbQuery, 400)) return bad("kbQuery must be text");
  let metric: MetricSpec | undefined;
  if (raw.evidence === "metric") {
    const m = raw.metric;
    if (!isObj(m) || !isStr(m.name, 80) || !isStr(m.unit, 20) || (m.op !== "<=" && m.op !== ">=") || typeof m.threshold !== "number" || !Number.isFinite(m.threshold)) {
      return bad("a metric gate needs metric { name, op (<= or >=), threshold (a number), unit }");
    }
    metric = { name: m.name.trim(), op: m.op, threshold: m.threshold, unit: m.unit.trim(), source: "simulated" };
  } else if (raw.metric !== undefined) return bad("metric applies only when evidence is metric");
  const flags = [...new Set(requires)] as Flag[];
  const def: GateDef = {
    label: raw.label.trim(), owner: raw.owner as RoleId, kbQuery: kbQuery.trim(),
    clientFacingOnly: flags.includes("client_facing") || raw.clientFacingOnly === true,
    category: raw.category as GateCategory, evidence: raw.evidence as EvidenceSource,
    ...(opts.custom || raw.optional === true ? { optional: true } : {}),
    ...(opts.custom ? { custom: true, requires: flags, rulesets: [...new Set(rulesets)] as RuleSetId[] } : {}),
    ...(metric ? { metric } : {}),
  };
  return { ok: true, def };
}

/** Pass/fail for a metric gate from a measured value; unknown when nothing was measured. */
export function metricStatus(m: MetricSpec, value: number | null): "pass" | "fail" | "unknown" {
  if (value === null || !Number.isFinite(value)) return "unknown";
  return (m.op === "<=" ? value <= m.threshold : value >= m.threshold) ? "pass" : "fail";
}

/** SIMULATED measured value for a metric gate: deterministic from the gate and use case, within +-30% of the threshold. */
export function simulatedMetric(gate: string, ext: string, m: MetricSpec): number {
  let h = 0;
  for (const c of `${gate}|${ext}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const f = 0.7 + ((h % 61) / 100); // 0.70 .. 1.30
  return Math.round(m.threshold * f * 1000) / 1000;
}

const APPLIES: Record<string, (f: HitlFacts) => boolean> = {
  client_facing: (f) => f.client_facing,
  affects_rights: (f) => !!f.affects_rights,
  irreversible: (f) => !!f.irreversible,
};

export interface Governance {
  gates: Record<GateId, GateDef>;
  rulesets: RuleSet[];
}

/** Validates the seed file shape and builds the typed structures. Throws on a malformed seed: a bad seed must not boot. */
export function parseGovernance(raw: unknown): Governance {
  if (!isObj(raw) || !isObj(raw.gates) || !Array.isArray(raw.rulesets)) throw new Error("governance seed: gates and rulesets are required");
  const gates: Record<GateId, GateDef> = {};
  for (const [id, g] of Object.entries(raw.gates)) {
    if (!ID_RE.test(id)) throw new Error(`governance seed: bad gate id ${id}`);
    const p = parseGateDef(g, { custom: false });
    if (!p.ok) throw new Error(`governance seed: gate ${id}: ${p.error}`);
    gates[id] = p.def;
  }
  const known = (ids: unknown, where: string) => {
    if (!Array.isArray(ids) || !ids.every((g) => typeof g === "string" && Object.hasOwn(gates, g))) throw new Error(`governance seed: ${where} lists an unknown gate`);
    return ids as GateId[];
  };
  const rulesets = raw.rulesets.map((r: unknown): RuleSet => {
    if (!isObj(r) || !RULESET_IDS.includes(r.id as RuleSetId) || !isStr(r.name, 120)) throw new Error("governance seed: bad rule set");
    const hd = r.hitlDefaults === "all" ? [...HITL_RULE_IDS] : (r.hitlDefaults as HitlRuleId[]);
    if (!Array.isArray(hd) || !hd.every((x) => (HITL_RULE_IDS as readonly string[]).includes(x))) throw new Error(`governance seed: ${r.id}: bad hitlDefaults`);
    if (r.capAutonomy !== "client_facing" && r.capAutonomy !== "always") throw new Error(`governance seed: ${r.id}: bad capAutonomy`);
    const hr = r.highRisk;
    let highRisk: RuleSet["highRisk"];
    if (hr !== undefined) {
      if (!isObj(hr) || typeof hr.appliesWhen !== "string" || !APPLIES[hr.appliesWhen] || hr.capAutonomy !== "always") throw new Error(`governance seed: ${r.id}: bad highRisk`);
      highRisk = { label: String(hr.label), applies: APPLIES[hr.appliesWhen], gates: known(hr.gates, `${r.id}.highRisk`), capAutonomy: "always", cites: hr.cites as string[] };
    }
    return {
      id: r.id as RuleSetId, name: r.name, gates: known(r.gates, String(r.id)), capAutonomy: r.capAutonomy, hitlDefaults: hd,
      thresholds: r.thresholds as Record<string, number>, cites: r.cites as RuleSet["cites"], notIngested: r.notIngested as string[],
      ...(highRisk ? { highRisk } : {}), gapIds: r.gapIds as string[],
    };
  });
  return { gates, rulesets };
}

export const SEED: Governance = parseGovernance(seed);
