import { CRITERIA } from "./sijil.ts";
import { type EntityGoal, type GoalCriterion } from "./goals.ts";

// What an admin may do to an entity, and to the people who belong to it. Pure: the routes and the stores call it.
//
//  - an entity is added by name (unique, any case), with an optional sector and goals;
//  - goals are the outcomes the entity wants (goals.ts): at least one and at most MAX_GOALS, each with text and an optional Prism criterion;
//  - hiding is reversible: a hidden entity's use cases leave the dashboard counts and the lists, and nothing is deleted;
//  - an entity's people come from their roles on its use cases; the people above any entity are federal members of a body (see below);
//  - a person's job title is free text up to 80 characters; it is what the approver rules match against a job profile's name.

export const MAX_GOALS = 12;
export const MAX_NAME = 120;
export interface EntityRow { name: string; sector: string | null; goals: EntityGoal[]; hidden: boolean }

const CRITERION_IDS = (CRITERIA as readonly string[]).filter((c) => c !== "goal_alignment") as GoalCriterion[];
export const GOAL_CRITERIA: readonly GoalCriterion[] = CRITERION_IDS;

/** The prefix of generated goal ids: the first word of the entity name, letters and digits only, upper case ("Marsa Public ..." gives MARSA). */
export const goalPrefix = (entity: string): string => (entity.trim().split(/\s+/)[0] ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) || "ENTITY";

/** Validates goals typed in the editor into the stored shape. Ids already present are kept when they are well formed and unique; new goals get the next free id. */
export function normalizeGoals(entity: string, raw: unknown): { ok: true; goals: EntityGoal[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length < 1) return { ok: false, error: "An entity needs at least one goal." };
  if (raw.length > MAX_GOALS) return { ok: false, error: `At most ${MAX_GOALS} goals.` };
  const prefix = goalPrefix(entity);
  const used = new Set<string>();
  const given = raw.map((g) => (g && typeof g === "object" && typeof (g as { id?: unknown }).id === "string" ? (g as { id: string }).id : ""));
  for (const id of given) if (/^[A-Z0-9]+-G\d+$/.test(id)) used.add(id);
  const taken = new Set<string>();
  let n = 0;
  const out: EntityGoal[] = [];
  for (const [i, g] of raw.entries()) {
    const o = (g && typeof g === "object" ? g : {}) as { text?: unknown; criterion?: unknown };
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (text.length < 5 || text.length > 300) return { ok: false, error: `Goal ${i + 1}: write the outcome in 5 to 300 characters.` };
    let criterion: GoalCriterion | null = null;
    if (o.criterion !== null && o.criterion !== undefined && o.criterion !== "") {
      if (!(CRITERION_IDS as string[]).includes(o.criterion as string)) return { ok: false, error: `Goal ${i + 1}: unknown criterion.` };
      criterion = o.criterion as GoalCriterion;
    }
    let id = given[i];
    if (!/^[A-Z0-9]+-G\d+$/.test(id) || taken.has(id)) {
      do { n += 1; id = `${prefix}-G${n}`; } while (used.has(id) || taken.has(id));
    }
    taken.add(id);
    out.push({ id, text, criterion });
  }
  return { ok: true, goals: out };
}

export type EntityAction =
  | { type: "add"; name: unknown; sector?: unknown; goals?: unknown }
  | { type: "set_goals"; name: unknown; goals: unknown }
  | { type: "set_hidden"; name: unknown; hidden: unknown };
export type EntityPlan =
  | { ok: true; type: "add"; row: EntityRow }
  | { ok: true; type: "set_goals"; name: string; goals: EntityGoal[] }
  | { ok: true; type: "set_hidden"; name: string; hidden: boolean; noop: boolean }
  | { ok: false; status: number; error: string };
const bad = (error: string, status = 400): EntityPlan => ({ ok: false, status, error });

/** Decides an entity change. `known` is every entity name the organisation has (its entity rows, its use cases' entities, the seeded ones); `hidden` those now hidden. */
export function planEntity(a: EntityAction, o: { known: string[]; hidden: string[] }): EntityPlan {
  const name = typeof a.name === "string" ? a.name.trim().replace(/\s+/g, " ") : "";
  if (a.type === "add") {
    if (name.length < 3 || name.length > MAX_NAME) return bad(`The entity name is 3 to ${MAX_NAME} characters.`);
    if (o.known.some((k) => k.toLowerCase() === name.toLowerCase())) return bad(`An entity named ${name} already exists.`, 409);
    const sector = typeof a.sector === "string" ? a.sector.trim().slice(0, 80) : "";
    const goals = a.goals === undefined || (Array.isArray(a.goals) && a.goals.length === 0) ? { ok: true as const, goals: [] as EntityGoal[] } : normalizeGoals(name, a.goals);
    if (!goals.ok) return bad(goals.error);
    return { ok: true, type: "add", row: { name, sector: sector || null, goals: goals.goals, hidden: false } };
  }
  const known = o.known.find((k) => k === name);
  if (!known) return bad("Unknown entity", 404);
  if (a.type === "set_goals") {
    const g = normalizeGoals(name, a.goals);
    return g.ok ? { ok: true, type: "set_goals", name, goals: g.goals } : bad(g.error);
  }
  if (typeof a.hidden !== "boolean") return bad("Hidden is true or false.");
  return { ok: true, type: "set_hidden", name, hidden: a.hidden, noop: o.hidden.includes(name) === a.hidden };
}

// ---- people ------------------------------------------------------------------------------------------------------------------
//
// An entity's people are NOT stored: a person belongs to an entity when they hold a live role on one of its use cases (un_role_assignments joined to
// the use case's entity), so the link can never disagree with who can actually act there. Granting that role is how someone is added to an entity.
// The people ABOVE any one entity (the federal central authority, the president's office) hold platform-wide roles and have no use case, so they
// are recorded as federal members, by the body they belong to. Membership ends rather than being deleted: it stays in the history.

/** The entities a person works at: those of the use cases they hold a live (not revoked) role on. Sorted, each once. */
export function entitiesOf(userId: string, rows: { user_id: string; use_case_id: string | null; revoked_at: string | null }[], useCases: { id: string; entity: string }[]): string[] {
  const names = rows
    .filter((r) => r.user_id === userId && !r.revoked_at && r.use_case_id)
    .map((r) => useCases.find((u) => u.id === r.use_case_id)?.entity)
    .filter((e): e is string => !!e);
  return [...new Set(names)].sort();
}
/** The people of an entity: everyone who holds a live role on one of its use cases. */
export function peopleOfEntity(entity: string, rows: { user_id: string; use_case_id: string | null; revoked_at: string | null }[], useCases: { id: string; entity: string }[]): string[] {
  const ids = new Set(useCases.filter((u) => u.entity === entity).map((u) => u.id));
  return [...new Set(rows.filter((r) => !r.revoked_at && r.use_case_id && ids.has(r.use_case_id)).map((r) => r.user_id))];
}

export const MAX_BODY = 120;
export interface MemberRow { id: string; body: string; user_id: string; added_by: string | null; added_at: string; removed_at: string | null; removed_by: string | null }
export type MemberAction = { type: "add"; body: unknown; user_id: unknown } | { type: "remove"; member_id: unknown };
export type MemberPlan =
  | { ok: true; type: "add"; row: { body: string; user_id: string; added_by: string } }
  | { ok: true; type: "remove"; member_id: string; removed_by: string }
  | { ok: false; error: string };

/** A person is a federal member of a body (for example "Federal Central Authority") once at a time; removing ends it and keeps the row. */
export function planMember(a: MemberAction, o: { rows: MemberRow[]; knownUsers: string[]; by: string }): MemberPlan {
  if (a.type === "remove") {
    const r = o.rows.find((x) => x.id === a.member_id);
    if (!r) return { ok: false, error: "That membership does not exist" };
    if (r.removed_at) return { ok: false, error: "That person has already been removed from this body" };
    return { ok: true, type: "remove", member_id: r.id, removed_by: o.by };
  }
  const body = typeof a.body === "string" ? a.body.trim().replace(/\s+/g, " ") : "";
  const user = typeof a.user_id === "string" ? a.user_id.trim() : "";
  if (body.length < 2 || body.length > MAX_BODY) return { ok: false, error: `The federal body is 2 to ${MAX_BODY} characters, for example Federal Central Authority.` };
  if (!o.knownUsers.includes(user)) return { ok: false, error: "That person is not in this organisation" };
  if (o.rows.some((x) => !x.removed_at && x.user_id === user && x.body.toLowerCase() === body.toLowerCase())) return { ok: false, error: "That person already belongs to this body" };
  return { ok: true, type: "add", row: { body, user_id: user, added_by: o.by } };
}

export const MAX_TITLE = 80;
/** A job title typed on the people screen: trimmed, 2 to 80 characters, or empty to clear it. */
export function parseJobTitle(raw: unknown): { ok: true; title: string | null } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "A job title is text." };
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return { ok: true, title: null };
  if (t.length < 2 || t.length > MAX_TITLE) return { ok: false, error: `A job title is 2 to ${MAX_TITLE} characters.` };
  return { ok: true, title: t };
}
