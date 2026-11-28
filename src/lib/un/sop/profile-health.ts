import { skillFromChunks, type SopChunk } from "../sop-kb.ts";
import type { JobProfile } from "./profiles.ts";

// CAN THIS JOB PROFILE HAVE A SKILL? The engine offers a job profile to tick only if a skill can be built for it, and says why when it cannot. A profile is derived from the SOP's text
// in one place and its skill is built from the SOP's passages in another, so the two can disagree for a shape of SOP nobody has met yet (a task shared by two roles was the first). Whatever the
// shape, the disagreement is caught here, in words a person can act on, instead of as a cryptic error when someone ticks the box. Pure: no I/O.

/** Why the skill builder refused, in words for the person who wrote the SOP. */
export function friendlySkillReason(raw: string, profile: string): string {
  if (/^no job profile named/i.test(raw)) return `The SOP has no section that describes the role "${profile}". A role needs a section of its own; a task shared by two roles belongs to both of them, and each of them needs its section.`;
  if (/has no tasks in/i.test(raw)) return `No task of the SOP is assigned to "${profile}", so there is nothing for its skill to say.`;
  return raw.replace(/ in custom-[\w-]+/, "");
}

/** null when a skill can be built for the profile from these passages, else why not. */
export function skillProblem(sopId: string, profile: string, chunks: SopChunk[]): string | null {
  try { skillFromChunks(sopId, profile, chunks); return null; }
  catch (e) { return friendlySkillReason(e instanceof Error ? e.message : "no skill", profile); }
}

/** Every profile of the list that cannot have a skill, with the reason. Empty when all can. */
export function profileProblems(sopId: string, profiles: JobProfile[], chunks: SopChunk[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of profiles) { const why = skillProblem(sopId, p.name, chunks); if (why) out[p.name] = why; }
  return out;
}
