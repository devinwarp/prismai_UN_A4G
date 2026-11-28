import { skillProblem } from "./sop/profile-health.ts";
import { liveChunks } from "./sop-kb-live.ts";
import { customSopFromText } from "./sop/custom.ts";
import type { SyntheticBaseline } from "./sop/types.ts";

// SOP intake analysis: does this SOP need structuring? Not every SOP does. One that is already in the Prism layout (a task per section, one job profile per task,
// a role section for each) gives job profiles and skills with the upload's own rules, and is attached as it is. One that does not is sent to the structuring step.
// The test is the real one, not a guess at style: derive the job profiles the way the upload does, cut the text into passages, and try to build the skill of every
// profile. Pure apart from reading the reference baseline the caller passes in. Never throws.

export interface SopAssessment {
  /** True when the SOP, as written, would not give job profiles and skills reliably. */
  needsStructuring: boolean;
  /** Plain-language reasons, for the screen. Empty when the SOP is fine as it is. */
  reasons: string[];
  profiles: number;
  /** How many of those profiles would get a skill. */
  skills: number;
}

export function assessSop(i: { title?: unknown; text: unknown; entity: string; baseline: SyntheticBaseline }): SopAssessment {
  const text = typeof i.text === "string" ? i.text : "";
  const made = customSopFromText({ title: i.title, text, entity: i.entity, baseline: i.baseline, takenIds: [], idBase: "assess" });
  if (!made.ok) return { needsStructuring: true, reasons: [made.error], profiles: 0, skills: 0 };
  const chunks = liveChunks({ sopId: made.sop_id, title: made.title, version: 1, body: made.body, useCaseExt: "UC", entity: i.entity });
  const reasons: string[] = [];
  let skills = 0;
  for (const p of made.profiles) {
    const why = skillProblem(made.sop_id, p.name, chunks);
    if (why) reasons.push(`${p.name}: ${why}`); else skills++;
  }
  // task sections the strict layout would silently drop (a "### T04." section with no "Job profile" line)
  const sections = (made.body.match(/^### T\d{2}\./gm) ?? []).length;
  const kept = made.profiles.reduce((n, p) => n + p.tasks.filter((t) => /^T\d{2}$/.test(t.id)).length, 0);
  if (sections > kept && kept > 0) reasons.push(`${sections - kept} task section(s) have no "Job profile" line and would be dropped.`);
  if (reasons.length) reasons.unshift("The SOP is not in the layout the skill builder reads (a task per section with a Job profile line, and a role section for each job profile), so its job profiles would not all get a skill.");
  return { needsStructuring: reasons.length > 0, reasons, profiles: made.profiles.length, skills };
}
