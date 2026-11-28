import { ownersOfTask } from "./owners.ts";
import { applicableRules, type HitlFacts } from "../hitl.ts";
import type { Verdict } from "../model.ts";
import { decideEffective, effectiveGates, type GovState } from "../gates.ts";
import { GATES, type GateId, type GateState } from "../policy.ts";
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

/** Repairs a profile list stored before joint ownership was understood: a "profile" named after two roles that are both profiles ("Violations Officer and Field Inspector") is not a
 * job of its own and has no skill. Its tasks go to each of the roles and it is dropped. Anything else is returned as it is, so a stored list that was right does not change. */
export function mergeJointProfiles(profiles: JobProfile[]): JobProfile[] {
  const names = profiles.map((p) => p.name);
  const joint = new Map(profiles.map((p) => [p.name, ownersOfTask(p.name, names.filter((n) => n !== p.name))] as const).filter(([, parts]) => parts.length > 1));
  if (!joint.size) return profiles;
  const tasks = new Map<string, ProfileTask[]>(profiles.filter((p) => !joint.has(p.name)).map((p) => [p.name, [...p.tasks]]));
  for (const p of profiles) for (const part of joint.get(p.name) ?? []) {
    const own = [...tasks.entries()].find(([n]) => n.toLowerCase() === part.toLowerCase());
    if (own) for (const t of p.tasks) if (!own[1].some((x) => x.id === t.id)) own[1].push(t);
  }
  return profiles.filter((p) => !joint.has(p.name)).map((p) => profile(p.name, (tasks.get(p.name) ?? p.tasks).sort((a, b) => a.id.localeCompare(b.id))));
}

/** SOPs that give each task its own "### T01." section with a "**Job profile:**" line (SOP-LIC-014). */
function structured(text: string): JobProfile[] {
  const found: { who: string; task: ProfileTask }[] = [];
  for (const sec of text.split(/^### /m).slice(1)) {
    const head = /^(T\d{2})\.\s+(.+)$/m.exec(sec.split("\n")[0]);
    const who = /\*\*Job profile:\*\*\s*([^.\n]+)/.exec(sec)?.[1].trim();
    if (!head || !who) continue;
    const body = sec.split("\n").slice(1).filter((l) => !/\*\*Job profile:\*\*/.test(l)).join("\n");
    found.push({ who, task: { id: head[1], title: head[2].trim(), flags: flagsOfText(`${head[2]}\n${body}`) } });
  }
  // a task two roles share belongs to each of them (owners.ts), not to a third profile named after both
  const owners = found.map((f) => f.who);
  const by = new Map<string, ProfileTask[]>();
  for (const { who, task } of found) for (const name of ownersOfTask(who, owners)) by.set(name, [...(by.get(name) ?? []), task]);
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

/** `use` (the use case's ext id and the org's gate state) folds its added gates and waivers into every profile's
 * verdict, through the same decideEffective() path the scenario runs use. Gates beyond the shipped nine have no
 * staged evidence here: they read pass in every case except "no evidence". */
export function assessProfiles(profiles: JobProfile[], ticked: ReadonlySet<string>, base: RuleSet, entity: string, use?: { ext: string; gov: GovState }): Assessment {
  const rows = profiles.map((p): ProfileAssessment => {
    const facts: HitlFacts = p.flags;
    const { rs, highRisk } = resolve(base, facts);
    const eff = effectiveGates({ ext: use?.ext ?? "", facts, ruleset: base, gov: use?.gov });
    const gates = eff.gates.filter((g) => !g.waiver).length;
    const hitl = applicableRules(hitlConfigFor(rs, entity), entity, facts).length;
    const verdicts = Object.fromEntries(
      EVIDENCE_KEYS.map((k) => {
        const ev: GateState = { ...EVIDENCE[k], ...(k === "no_evidence" ? {} : Object.fromEntries(eff.gates.filter((g) => !ALL.includes(g.id)).map((g) => [g.id, "pass" as const]))) };
        return [k, decideEffective({ ext: use?.ext ?? "", facts, requested: "GO_AUTONOMOUS", gates: ev, ruleset: base, gov: use?.gov }).decision.verdict];
      }),
    ) as Record<EvidenceKey, Verdict>;
    return { name: p.name, tasks: p.tasks.length, automate: ticked.has(p.name), flags: p.flags, gates, hitl, highRisk, verdicts };
  });
  const on = rows.filter((r) => r.automate);
  const rollup = on.length ? (Object.fromEntries(EVIDENCE_KEYS.map((k) => [k, mostRestrictive(on.map((r) => r.verdicts[k]))])) as Record<EvidenceKey, Verdict>) : null;
  return { rows, rollup };
}
