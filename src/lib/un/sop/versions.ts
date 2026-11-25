import { retrievablePart } from "../sop-kb.ts";
import { MAX_SOP_CHARS } from "./custom-limits.ts";
import { nextTaskId, planProfileEdit, type ProfileOp } from "./custom.ts";
import { analyzeSop } from "./reference.ts";
import { deriveProfiles, type JobProfile } from "./profiles.ts";
import type { SyntheticBaseline } from "./types.ts";

// SOP versions. Pure: the stores and the routes call it.
//
// An SOP is a ROOT (an id) with VERSIONS 1, 2, 3 ... Version 1 of a shipped sample is its file; every later change, whether new text or an edit of a job
// profile, is a new version. A use case is attached to one specific version, so:
//   - a use case that is deployed (in production) stays on the version it has: it is FROZEN until its business process owner asks to move it;
//   - every use case that is not deployed moves to a new version at once, and only the job profiles the change affects are touched.
// What a new TEXT changes is worked out against the last version, profile by profile:
//   - added      a profile the new text has and the last one did not
//   - removed    a profile the last text had and the new one does not
//   - changed    the same profile, but its tasks (their wording or risk flags) differ
//   - unchanged  the same profile with the same tasks: it is kept exactly as it was, including any edit an admin made to it, and so are its task ids
//   - kept_manual a profile an admin added by hand (it was never in the text): it stays, because no text removed it
// Task ids (T01, T02, ...) are kept for a task whose wording did not change, because tests and skills point at them, and are unique across the SOP.

export interface SopChanges {
  /** The version this one was made from. */
  from: number;
  lines: { added: string[]; removed: string[]; more: number };
  profiles: { added: string[]; removed: string[]; changed: string[]; unchanged: string[]; kept_manual: string[] };
  /** Set when the version came from editing a job profile by hand rather than from new text. */
  manual?: { type: "add" | "update" | "remove"; name: string; new_name?: string };
}
export interface SopVersion { sop_id: string; version: number; title: string; body: string; profiles: JobProfile[]; changes: SopChanges | null; created_by?: string | null; created_at?: string | null }

const CAP = 40;
const norm = (t: string) => t.split(/\r?\n/).map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean);

/** Which lines of the text are only in the new version and which only in the old one (capped, with how many more there were). */
export function diffLines(oldText: string, newText: string): SopChanges["lines"] {
  const a = norm(retrievablePart(oldText)), b = norm(retrievablePart(newText));
  const sa = new Set(a), sb = new Set(b);
  const added = b.filter((l) => !sa.has(l)), removed = a.filter((l) => !sb.has(l));
  return { added: added.slice(0, CAP), removed: removed.slice(0, CAP), more: Math.max(0, added.length - CAP) + Math.max(0, removed.length - CAP) };
}

/** The job profiles a text gives, by the same rules the intake screen uses. */
export function deriveFrom(text: string, o: { sopId: string; title: string; entity: string; baseline: SyntheticBaseline }): { profiles: JobProfile[]; steps: number } {
  const body = retrievablePart(text);
  const a = analyzeSop({ sop_id: o.sopId, title: o.title, text: body, baseline: o.baseline, metadata: { entity: o.entity, entity_sector: "Public services" } });
  return { profiles: deriveProfiles(a, body), steps: a.steps.length };
}

const sameTasks = (a: JobProfile, b: JobProfile) =>
  a.tasks.length === b.tasks.length && a.tasks.every((t, i) => t.title === b.tasks[i].title && JSON.stringify(t.flags) === JSON.stringify(b.tasks[i].flags));

/** Gives every task an id that is unique across the profiles: a task keeps the id it had when its wording is the same, the others get the next free one. */
function reid(profiles: JobProfile[], known: Map<string, string>): JobProfile[] {
  const used = new Set<string>();
  const out: JobProfile[] = [];
  for (const p of profiles) {
    const tasks = p.tasks.map((t) => {
      const want = known.get(`${p.name}\u0000${t.title}`) ?? t.id;
      if (want && !used.has(want)) { used.add(want); return { ...t, id: want }; }
      return t;
    });
    out.push({ ...p, tasks });
  }
  // second pass: anything that collided gets a fresh id
  const seen = new Set<string>();
  return out.map((p) => ({
    ...p,
    tasks: p.tasks.map((t) => {
      if (!seen.has(t.id)) { seen.add(t.id); return t; }
      const id = nextTaskId(out, [...seen]);
      seen.add(id);
      return { ...t, id };
    }),
  }));
}

export type NewVersion = { ok: true; version: SopVersion } | { ok: false; error: string };

/** The next version of an SOP made from new text. Only the job profiles the change affects are derived again; the rest are kept as they were. */
export function planNewVersion(prev: SopVersion, o: { text: unknown; title?: unknown; entity: string; baseline: SyntheticBaseline }): NewVersion {
  const text = typeof o.text === "string" ? o.text : "";
  if (!text.trim()) return { ok: false, error: "The SOP text is empty." };
  if (text.length > MAX_SOP_CHARS) return { ok: false, error: "The SOP is too large (200 KB limit)." };
  const title = ((typeof o.title === "string" && o.title.trim()) || text.match(/^#\s+(.+)$/m)?.[1]?.trim() || prev.title).slice(0, 120);
  const ctx = { sopId: prev.sop_id, title, entity: o.entity, baseline: o.baseline };
  const next = deriveFrom(text, ctx);
  if (!next.steps) return { ok: false, error: "No steps were found in this SOP." };
  if (!next.profiles.length) return { ok: false, error: "No job profiles could be found: the SOP needs steps that say who does the work." };
  if (norm(retrievablePart(text)).join("\n") === norm(retrievablePart(prev.body)).join("\n")) return { ok: false, error: "This text is the same as version " + prev.version + ": nothing to publish." };
  const old = deriveFrom(prev.body, { ...ctx, title: prev.title });
  const oldBy = new Map(old.profiles.map((p) => [p.name, p]));
  const prevBy = new Map(prev.profiles.map((p) => [p.name, p]));
  const known = new Map<string, string>();
  for (const p of prev.profiles) for (const t of p.tasks) known.set(`${p.name}\u0000${t.title}`, t.id);

  const added: string[] = [], changed: string[] = [], unchanged: string[] = [];
  const merged: JobProfile[] = [];
  for (const np of next.profiles) {
    const op = oldBy.get(np.name);
    if (!op) { added.push(np.name); merged.push(np); }
    else if (sameTasks(op, np)) { unchanged.push(np.name); merged.push(prevBy.get(np.name) ?? np); }
    else { changed.push(np.name); merged.push(np); }
  }
  const nextNames = new Set(next.profiles.map((p) => p.name));
  const removed = prev.profiles.filter((p) => oldBy.has(p.name) && !nextNames.has(p.name)).map((p) => p.name);
  const manual = prev.profiles.filter((p) => !oldBy.has(p.name) && !nextNames.has(p.name));
  const profiles = reid([...merged, ...manual], known);
  return {
    ok: true,
    version: {
      sop_id: prev.sop_id, version: prev.version + 1, title, body: text, profiles,
      changes: { from: prev.version, lines: diffLines(prev.body, text), profiles: { added, removed, changed, unchanged, kept_manual: manual.map((p) => p.name) } },
    },
  };
}

/** The next version made by editing a job profile by hand (add, rename or change its tasks, remove). The text does not change. */
export function planManualVersion(prev: SopVersion, op: ProfileOp): NewVersion & { status?: number } {
  const plan = planProfileEdit(prev.profiles, op);
  if (!plan.ok) return { ok: false, error: plan.error, status: plan.status };
  const names = plan.profiles.map((p) => p.name);
  const touched = plan.change.type === "update" ? (plan.change.new_name ?? plan.change.name) : plan.change.name;
  return {
    ok: true,
    version: {
      sop_id: prev.sop_id, version: prev.version + 1, title: prev.title, body: prev.body, profiles: plan.profiles,
      changes: {
        from: prev.version, lines: { added: [], removed: [], more: 0 },
        profiles: {
          added: plan.change.type === "add" ? [plan.change.name] : [],
          removed: plan.change.type === "remove" ? [plan.change.name] : [],
          changed: plan.change.type === "update" ? [touched] : [],
          unchanged: names.filter((n) => n !== touched),
          kept_manual: [],
        },
        manual: plan.change,
      },
    },
  };
}

/** Whether a change leaves a profile's job as it was, so the ticks and tests made for it still stand. */
export const affected = (c: SopChanges | null): string[] => (c ? [...c.profiles.added, ...c.profiles.removed, ...c.profiles.changed] : []);
