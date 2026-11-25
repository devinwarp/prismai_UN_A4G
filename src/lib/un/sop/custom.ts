import { retrievablePart } from "../sop-kb.ts";
import { slug } from "./promote.ts";
import { analyzeSop, flagsOfText } from "./reference.ts";
import { deriveProfiles, type JobProfile, type ProfileTask } from "./profiles.ts";
import type { SyntheticBaseline } from "./types.ts";

// A use case can have an SOP of its own (pasted by an admin) instead of one of the shipped samples, and the job profiles of such an SOP can be
// edited: added, renamed, given other tasks, removed. Pure: the route and the store call it.
//
//  - a profile is one person's job in the procedure: a name and its tasks; a task's risk flags are worked out from its text (flagsOfText), so
//    editing a task re-derives its flags, and a profile's flags are on if any task has them;
//  - task ids (T01, T02, ...) are unique across the whole SOP, because tests and skills are keyed by them;
//  - the last profile of an SOP cannot be removed (an SOP with no profiles has nothing to assess);
//  - the shipped samples are not edited in place: an admin makes an editable copy first.

import { MAX_PROFILES, MAX_SOP_CHARS, MAX_TASKS } from "./custom-limits.ts";
export { MAX_PROFILES, MAX_SOP_CHARS, MAX_TASKS };
const NAME = [2, 80] as const;
const TASK = [3, 200] as const;

const anyFlag = (tasks: ProfileTask[]) => ({
  client_facing: tasks.some((t) => t.flags.client_facing),
  affects_rights: tasks.some((t) => t.flags.affects_rights),
  irreversible: tasks.some((t) => t.flags.irreversible),
});
const make = (name: string, tasks: ProfileTask[]): JobProfile => ({ name, tasks, flags: anyFlag(tasks) });

const idNum = (id: string) => Number(/^T(\d+)$/.exec(id)?.[1] ?? 0);
/** The next free task id across all profiles of an SOP: T01, T02, ... */
export function nextTaskId(profiles: JobProfile[], extra: string[] = []): string {
  const n = Math.max(0, ...profiles.flatMap((p) => p.tasks.map((t) => idNum(t.id))), ...extra.map(idNum)) + 1;
  return `T${String(n).padStart(2, "0")}`;
}

/** Task titles typed one per line: trimmed, blank lines dropped, each 3 to 200 characters, at most MAX_TASKS. */
export function parseTaskLines(raw: unknown): { ok: true; titles: string[] } | { ok: false; error: string } {
  const lines = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/) : null);
  if (!lines) return { ok: false, error: "Give the tasks of the job profile, one per line." };
  const titles = lines.map((l) => (typeof l === "string" ? l.trim().replace(/\s+/g, " ") : "")).filter(Boolean);
  if (!titles.length) return { ok: false, error: "A job profile needs at least one task." };
  if (titles.length > MAX_TASKS) return { ok: false, error: `At most ${MAX_TASKS} tasks in a job profile.` };
  const bad = titles.findIndex((t) => t.length < TASK[0] || t.length > TASK[1]);
  if (bad >= 0) return { ok: false, error: `Task ${bad + 1}: write it in ${TASK[0]} to ${TASK[1]} characters.` };
  return { ok: true, titles };
}

const cleanName = (raw: unknown) => (typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "");
const nameError = (name: string) => (name.length < NAME[0] || name.length > NAME[1] ? `A job profile name is ${NAME[0]} to ${NAME[1]} characters.` : null);

export type ProfileOp =
  | { type: "add"; name: unknown; tasks: unknown }
  | { type: "update"; name: unknown; new_name?: unknown; tasks?: unknown }
  | { type: "remove"; name: unknown };
export type ProfilePlan =
  | { ok: true; profiles: JobProfile[]; change: { type: "add" | "update" | "remove"; name: string; new_name?: string } }
  | { ok: false; status: number; error: string };
const bad = (error: string, status = 400): ProfilePlan => ({ ok: false, error, status });

/** Applies one edit to an SOP's job profiles and returns the new list, or why not. Never changes its input. */
export function planProfileEdit(profiles: JobProfile[], op: ProfileOp): ProfilePlan {
  const name = cleanName(op.name);
  const taken = (n: string, except?: string) => profiles.some((p) => p.name.toLowerCase() === n.toLowerCase() && p.name !== except);
  if (op.type === "add") {
    const e = nameError(name);
    if (e) return bad(e);
    if (taken(name)) return bad(`The SOP already has a job profile named ${name}.`, 409);
    if (profiles.length >= MAX_PROFILES) return bad(`At most ${MAX_PROFILES} job profiles.`);
    const t = parseTaskLines(op.tasks);
    if (!t.ok) return bad(t.error);
    const tasks: ProfileTask[] = [];
    for (const title of t.titles) tasks.push({ id: nextTaskId(profiles, tasks.map((x) => x.id)), title, flags: flagsOfText(title) });
    return { ok: true, profiles: [...profiles, make(name, tasks)], change: { type: "add", name } };
  }
  const at = profiles.findIndex((p) => p.name === name);
  if (at < 0) return bad("That job profile does not exist.", 404);
  if (op.type === "remove") {
    if (profiles.length < 2) return bad("The last job profile cannot be removed: an SOP with none has nothing to assess.", 409);
    return { ok: true, profiles: profiles.filter((_, i) => i !== at), change: { type: "remove", name } };
  }
  const cur = profiles[at];
  let nextName = cur.name;
  if (op.new_name !== undefined) {
    nextName = cleanName(op.new_name);
    const e = nameError(nextName);
    if (e) return bad(e);
    if (taken(nextName, cur.name)) return bad(`The SOP already has a job profile named ${nextName}.`, 409);
  }
  let tasks = cur.tasks;
  if (op.tasks !== undefined) {
    const t = parseTaskLines(op.tasks);
    if (!t.ok) return bad(t.error);
    const others = profiles.filter((_, i) => i !== at);
    const spare = [...cur.tasks];
    tasks = [];
    for (const title of t.titles) {
      // a task whose text did not change keeps its id (tests and skills point at it); a new or reworded one gets a fresh id
      const same = spare.findIndex((x) => x.title === title);
      if (same >= 0) { const [k] = spare.splice(same, 1); tasks.push(k); }
      else tasks.push({ id: nextTaskId(others, tasks.map((x) => x.id).concat(cur.tasks.map((x) => x.id))), title, flags: flagsOfText(title) });
    }
  }
  const next = profiles.map((p, i) => (i === at ? make(nextName, tasks) : p));
  return { ok: true, profiles: next, change: { type: "update", name: cur.name, ...(nextName !== cur.name ? { new_name: nextName } : {}) } };
}

/** Derives the job profiles of a pasted SOP with the reference analyzer (the same rules the intake screen uses). */
export function customSopFromText(i: { title: unknown; text: unknown; entity: string; baseline: SyntheticBaseline; takenIds: string[]; idBase: string }):
  { ok: true; sop_id: string; title: string; body: string; profiles: JobProfile[] } | { ok: false; error: string } {
  const text = typeof i.text === "string" ? i.text : "";
  if (!text.trim()) return { ok: false, error: "The SOP text is empty." };
  if (text.length > MAX_SOP_CHARS) return { ok: false, error: "The SOP is too large (200 KB limit)." };
  const title = ((typeof i.title === "string" && i.title.trim()) || text.match(/^#\s+(.+)$/m)?.[1]?.trim() || "").slice(0, 120);
  if (title.length < 3) return { ok: false, error: "Give the SOP a title of at least 3 characters." };
  const base = `custom-${slug(i.idBase) || "uc"}-${slug(title) || "sop"}`.slice(0, 80);
  let sop_id = base;
  for (let n = 2; i.takenIds.includes(sop_id); n++) sop_id = `${base}-${n}`;
  const body = retrievablePart(text);
  const a = analyzeSop({ sop_id, title, text: body, baseline: i.baseline, metadata: { entity: i.entity, entity_sector: "Public services" } });
  if (!a.steps.length) return { ok: false, error: "No steps were found in this SOP." };
  const profiles = deriveProfiles(a, body);
  if (!profiles.length) return { ok: false, error: "No job profiles could be found: the SOP needs steps that say who does the work (for example \"The licensing officer checks the file\")." };
  return { ok: true, sop_id, title, body: text, profiles: profiles.slice(0, MAX_PROFILES) };
}
