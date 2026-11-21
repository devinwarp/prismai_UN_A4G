import { applicableRules, type HitlFacts } from "../hitl.ts";
import type { Verdict } from "../model.ts";
import { GATES, decide, type GateId, type GateState } from "../policy.ts";
import { hitlConfigFor, resolve, type RuleSet } from "../rulesets.ts";
import { flagsOfText } from "./reference.ts";
import type { FlagId, SopAnalysis } from "./types.ts";

// Job profiles of an SOP, and the per-profile assessment. Pure: no I/O.
// A profile is one person's job in the procedure. Only profiles ticked "Automate" are assessed:
// their flags (on if ANY task has the flag) go to decide() under the chosen rule set, and the use
// case takes the MOST RESTRICTIVE verdict across the ticked profiles (owner decision).
// Flags come from the reference analyzer's cues, which are heuristics: a person confirms them.

export interface ProfileTask { id: string; title: string; flags: Record<FlagId, boolean> }
export interface JobProfile { name: string; tasks: ProfileTask[]; flags: Record<FlagId, boolean> }

const anyFlag = (tasks: ProfileTask[]): Record<FlagId, boolean> => ({
  client_facing: tasks.some((t) => t.flags.client_facing),
  affects_rights: tasks.some((t) => t.flags.affects_rights),
  irreversible: tasks.some((t) => t.flags.irreversible),
});
const profile = (name: string, tasks: ProfileTask[]): JobProfile => ({ name, tasks, flags: anyFlag(tasks) });

/** SOPs that give each task its own "### T01." section with a "**Job profile:**" line (SOP-LIC-014). */
function structured(text: string): JobProfile[] {
  const by = new Map<string, ProfileTask[]>();
  for (const sec of text.split(/^### /m).slice(1)) {
    const head = /^(T\d{2})\.\s+(.+)$/m.exec(sec.split("\n")[0]);
    const who = /\*\*Job profile:\*\*\s*([^.\n]+)/.exec(sec)?.[1].trim();
    if (!head || !who) continue;
    const body = sec.split("\n").slice(1).filter((l) => !/\*\*Job profile:\*\*/.test(l)).join("\n");
    const list = by.get(who) ?? [];
    list.push({ id: head[1], title: head[2].trim(), flags: flagsOfText(`${head[2]}\n${body}`) });
    by.set(who, list);
  }
  return [...by].map(([n, t]) => profile(n, t));
}

const EXTERNAL = /^(applicant|citizen|customer)$/i;

/** Profiles from the analyzer's actors and their steps; a SOP with its own task sections uses those. */
export function deriveProfiles(a: SopAnalysis, text: string): JobProfile[] {
  const s = structured(text);
  if (s.length) return s;
  const staff = a.actors.filter((x) => !EXTERNAL.test(x));
  const canon = (actor: string | null) => actor && staff.find((x) => x === actor || x.toLowerCase().endsWith(` ${actor.toLowerCase()}`));
  return staff
    .map((name) => profile(name, a.steps.filter((st) => canon(st.actor) === name).map((st) => ({ id: st.id, title: st.text, flags: flagsOfText(st.text) }))))
    .filter((p) => p.tasks.length);
}

// ---- assessment ------------------------------------------------------------------------------

export const EVIDENCE_KEYS = ["all_pass", "one_fix", "hosting_fails", "no_evidence"] as const;
export type EvidenceKey = (typeof EVIDENCE_KEYS)[number];

const ALL = Object.keys(GATES) as GateId[];
/** The four evidence cases of the plan's worked example. */
export const EVIDENCE: Record<EvidenceKey, GateState> = {
  all_pass: Object.fromEntries(ALL.map((g) => [g, "pass"])),
  one_fix: { ...Object.fromEntries(ALL.map((g) => [g, "pass"])), data_lawful: "fix_declared" },
  hosting_fails: { ...Object.fromEntries(ALL.map((g) => [g, "pass"])), approved_infrastructure: "fail" },
  no_evidence: {},
};

/** Least to most restrictive. ESCALATE (no evidence) sits above ASSISTANT_ONLY, below NO_GO. */
export const RESTRICTIVE_ORDER: Verdict[] = ["GO_AUTONOMOUS", "GO_SUPERVISED", "ASSISTANT_ONLY", "ESCALATE", "NO_GO"];
export const mostRestrictive = (vs: Verdict[]): Verdict | null => vs.reduce<Verdict | null>((m, v) => (m === null || RESTRICTIVE_ORDER.indexOf(v) > RESTRICTIVE_ORDER.indexOf(m) ? v : m), null);

export interface ProfileAssessment {
  name: string;
  tasks: number;
  automate: boolean;
  flags: Record<FlagId, boolean>;
  gates: number;
  hitl: number;
  highRisk: boolean;
  verdicts: Record<EvidenceKey, Verdict>;
}
export interface Assessment { rows: ProfileAssessment[]; rollup: Record<EvidenceKey, Verdict> | null }

export function assessProfiles(profiles: JobProfile[], ticked: ReadonlySet<string>, base: RuleSet, entity: string): Assessment {
  const rows = profiles.map((p): ProfileAssessment => {
    const facts: HitlFacts = p.flags;
    const { rs, highRisk } = resolve(base, facts);
    const gates = ALL.filter((g) => (facts.client_facing || !GATES[g].clientFacingOnly) && rs.gates.includes(g)).length;
    const hitl = applicableRules(hitlConfigFor(rs, entity), entity, facts).length;
    const verdicts = Object.fromEntries(
      EVIDENCE_KEYS.map((k) => [k, decide({ clientFacing: facts.client_facing, requested: "GO_AUTONOMOUS", gates: EVIDENCE[k], ruleset: rs }).verdict]),
    ) as Record<EvidenceKey, Verdict>;
    return { name: p.name, tasks: p.tasks.length, automate: ticked.has(p.name), flags: p.flags, gates, hitl, highRisk, verdicts };
  });
  const on = rows.filter((r) => r.automate);
  const rollup = on.length ? (Object.fromEntries(EVIDENCE_KEYS.map((k) => [k, mostRestrictive(on.map((r) => r.verdicts[k]))])) as Record<EvidenceKey, Verdict>) : null;
  return { rows, rollup };
}
