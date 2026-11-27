import { approvable, coverage, FAMILIES, SCENARIOS, testSetHash, type Blueprint, type Check, type Family, type Gap, type GenSpec, type Scenario } from "./test-derive.ts";
import { appendEntry, verifyChain, type ChainEntry } from "./tuning.ts";

// The test set of one job profile of one use case, as a hash-chained log. Pure: no I/O.
//
// Everything is replayed from the log, so nothing can be edited or removed without breaking the chain. The set starts
// as the tests derived from the skill (test-derive.ts); the process owner adds, edits and retires from there, and
// approves a version. An approved version carries the hash of the whole set; any later change makes it a draft again
// until it is re-approved, so a pilot run can say exactly which approved set it ran.
//
// Rules, all enforced by plan() below and tested:
//  - "delete" is retire: a reason is required and the entry stays in the log;
//  - retiring the only test for a REQUIRED slot needs a named waiver approver;
//  - a set can be approved only when coverage() finds no gap;
//  - the person who changed the set cannot approve it, unless they say why (the reason is logged), because a small
//    team may have one person in both roles (see the access design in the plan).

export type TestKind = "created" | "added" | "edited" | "retired" | "restored" | "approved" | "withdrawn";
export type TestEntry = ChainEntry<TestKind>;

export interface TestSetState {
  exists: boolean;
  profile: string | null;
  sop_id: string | null;
  blueprints: Blueprint[];
  /** Number of approvals so far. */
  version: number;
  /** The latest approval, or null if none or it was withdrawn. */
  approved: { version: number; hash: string; approver: string; approver_source: string; at: string; by: string; self_approval_reason?: string } | null;
  /** True when anything changed since the last approval (or since creation). */
  draft: boolean;
  /** User ids that changed the set since the last approval. */
  authors: string[];
}

export const EMPTY_TESTSET: TestSetState = { exists: false, profile: null, sop_id: null, blueprints: [], version: 0, approved: null, draft: false, authors: [] };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The approved set currently in force: approved, and unchanged since. */
export const inForce = (s: TestSetState): boolean => !!s.approved && !s.draft;

const EDITABLE = ["title", "expect", "gates", "scenario"] as const;

export function replayTestSet(entries: TestEntry[]): TestSetState {
  const s: TestSetState = { ...EMPTY_TESTSET, blueprints: [], authors: [] };
  const touch = (by: string) => { s.draft = true; if (by && !s.authors.includes(by)) s.authors.push(by); };
  for (const e of entries) {
    const p = e.payload;
    const by = str(p.by);
    if (e.kind === "created") {
      s.exists = true; s.profile = str(p.profile); s.sop_id = str(p.sop_id);
      s.blueprints = (p.blueprints as Blueprint[]).map((b) => ({ ...b }));
      s.draft = true; // a new set is a draft until someone approves it; the system creating it is not an author
    } else if (e.kind === "added") {
      s.blueprints.push({ ...(p.blueprint as Blueprint) }); touch(by);
    } else if (e.kind === "edited") {
      const b = s.blueprints.find((x) => x.id === p.id);
      if (b) Object.assign(b, p.changes as Partial<Blueprint>);
      touch(by);
    } else if (e.kind === "retired") {
      const b = s.blueprints.find((x) => x.id === p.id);
      if (b) { b.status = "retired"; b.retired = { reason: str(p.reason), ...(str(p.waiver_approver) ? { waiver_approver: str(p.waiver_approver) } : {}) }; }
      touch(by);
    } else if (e.kind === "restored") {
      const b = s.blueprints.find((x) => x.id === p.id);
      if (b) { b.status = "active"; delete b.retired; }
      touch(by);
    } else if (e.kind === "approved") {
      s.version += 1;
      s.approved = { version: s.version, hash: str(p.hash), approver: str(p.approver), approver_source: str(p.approver_source), at: e.at, by, ...(str(p.self_approval_reason) ? { self_approval_reason: str(p.self_approval_reason) } : {}) };
      s.draft = false; s.authors = [];
    } else if (e.kind === "withdrawn") {
      s.approved = null; s.draft = true;
    }
  }
  return s;
}

// ---- actions ---------------------------------------------------------------------------------

export type Action =
  | { type: "create"; profile: string; sop_id: string; required: Blueprint[] }
  | { type: "add"; blueprint: { title: string; family: Family; task?: string | null; scenario?: Scenario; slot?: string; expect: Check[]; gates?: string[]; source?: string[]; gen?: GenSpec } }
  | { type: "edit"; id: string; changes: { title?: string; expect?: Check[]; gates?: string[]; scenario?: Scenario }; reason?: string }
  | { type: "retire"; id: string; reason: string; waiver_approver?: string }
  | { type: "restore"; id: string; reason: string }
  | { type: "approve"; approver: { title: string; source: string }; note?: string; self_approval_reason?: string }
  | { type: "withdraw"; reason: string };

export type Plan = { ok: true; kind: TestKind; payload: Record<string, unknown> } | { ok: false; error: string };

const bad = (error: string): Plan => ({ ok: false, error });
/** The operators of a generated assertion (the same list as OPS in testgen.ts, kept here so this file stays free of the model client). */
const GEN_OPS = ["eq", "ne", "contains", "gte", "lte", "true", "false", "null"];
const GEN_OUTCOMES = ["produce", "refuse", "escalate"];

/** What is wrong with the generated-case part of a blueprint, or null. Only the proposal route supplies it, from a case in the log
 * that the generator's own validator already passed; this is a second look at its shape, since the pilot will run it. */
export function genSpecProblem(g: unknown): string | null {
  const o = g as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return "a generated test needs its case";
  if (typeof o.case_id !== "string" || !o.case_id || o.case_id.length > 120) return "a generated test needs its case id";
  if (typeof o.model !== "string") return "a generated test records the model that wrote it";
  const i = o.input as Record<string, unknown> | null;
  if (!i || typeof i !== "object" || typeof i.task !== "string") return "a generated test needs a task";
  if (i.kind === "sop") {
    if (typeof i.requested_task !== "string" || !i.requested_task || typeof i.request !== "string" ||
      !i.request.trim() || i.request.length > 4000 || typeof i.context_hash !== "string" || !/^[a-f0-9]{64}$/.test(i.context_hash)) return "an SOP test needs a request, requested task and procedure fingerprint";
  } else if (i.kind !== undefined || typeof i.agent !== "string" || typeof i.licence !== "string") {
    return "a generated licensing test needs an agent and a licence";
  }
  const e = o.expect as { outcome?: unknown; assertions?: unknown } | null;
  if (!e || typeof e !== "object" || !GEN_OUTCOMES.includes(String(e.outcome))) return "a generated test needs an expected outcome";
  if (!Array.isArray(e.assertions) || e.assertions.length < 1 || e.assertions.length > 12) return "a generated test needs 1 to 12 assertions";
  for (const a of e.assertions as Record<string, unknown>[]) if (!a || typeof a.path !== "string" || !a.path || !GEN_OPS.includes(String(a.op))) return "an assertion needs a path and a known operator";
  return null;
}

const checkOk = (c: unknown): c is Check =>
  !!c && typeof c === "object" && ["exact", "rubric", "metric"].includes((c as Check).kind) && typeof (c as Check).text === "string" && (c as Check).text.trim().length > 0 && (c as Check).text.length <= 600;

/** Validate an action against the current state and the requirements derived from the skill now, and say what to log. */
export function plan(state: TestSetState, required: Blueprint[], a: Action, by: string): Plan {
  if (a.type === "create") {
    if (state.exists) return bad("A test set already exists for this profile");
    if (!a.required.length) return bad("Nothing to derive: the profile has no tasks");
    return { ok: true, kind: "created", payload: { profile: a.profile, sop_id: a.sop_id, blueprints: a.required, required_hash: testSetHash(a.required), by } };
  }
  if (!state.exists) return bad("Create the test set first");

  if (a.type === "add") {
    const b = a.blueprint;
    if (!FAMILIES.includes(b.family)) return bad("Unknown test family");
    if (b.scenario && !SCENARIOS.includes(b.scenario)) return bad("Unknown scenario kind");
    const title = str(b.title).trim();
    if (!title || title.length > 200) return bad("A test needs a title of at most 200 characters");
    if (!Array.isArray(b.expect) || !b.expect.length || !b.expect.every(checkOk)) return bad("A test needs at least one expected-output check, each with text of at most 600 characters");
    if (b.gen !== undefined) { const why = genSpecProblem(b.gen); if (why) return bad(why); }
    if (b.gen && state.blueprints.some((x) => x.gen?.case_id === b.gen!.case_id && x.status === "active")) return bad("This generated case is already in the test set");
    let n = 1;
    while (state.blueprints.some((x) => x.id === `manual.${n}`)) n++;
    const blueprint: Blueprint = {
      id: `manual.${n}`, slot: b.slot?.trim() || `manual:${n}`, family: b.family, task: b.task ?? null, ...(b.scenario ? { scenario: b.scenario } : {}),
      title, source: b.source ?? [], derived: false, status: "active", expect: b.expect.map((c) => ({ kind: c.kind, text: c.text.trim() })), ...(b.gates?.length ? { gates: b.gates } : {}), ...(b.gen ? { gen: b.gen } : {}),
    };
    return { ok: true, kind: "added", payload: { blueprint, by } };
  }

  const target = "id" in a ? state.blueprints.find((x) => x.id === a.id) : undefined;
  if ("id" in a && !target) return bad("No such test");

  if (a.type === "edit") {
    const keys = Object.keys(a.changes);
    if (!keys.length) return bad("Nothing to change");
    if (keys.some((k) => !(EDITABLE as readonly string[]).includes(k))) return bad("Only the title, expected output, gates and scenario can be edited; to change what a test covers, retire it and add another");
    if (target!.status === "retired") return bad("Restore the test before editing it");
    if (target!.gen?.input.kind === "sop" && a.changes.expect !== undefined) return bad("Retire the generated test and accept a new proposal to change its expected result");
    if (a.changes.title !== undefined && (!a.changes.title.trim() || a.changes.title.length > 200)) return bad("A test needs a title of at most 200 characters");
    if (a.changes.expect !== undefined && (!a.changes.expect.length || !a.changes.expect.every(checkOk))) return bad("A test needs at least one expected-output check");
    if (a.changes.scenario !== undefined && !SCENARIOS.includes(a.changes.scenario)) return bad("Unknown scenario kind");
    if (a.changes.scenario !== undefined && target!.derived) return bad("The scenario of a derived test cannot be changed");
    return { ok: true, kind: "edited", payload: { id: a.id, changes: a.changes, ...(a.reason ? { reason: a.reason } : {}), by } };
  }

  if (a.type === "retire") {
    if (target!.status === "retired") return bad("Already retired");
    if (str(a.reason).trim().length < 3) return bad("Retiring a test needs a reason");
    const needed = required.some((r) => r.slot === target!.slot);
    const otherCover = state.blueprints.some((x) => x.id !== target!.id && x.slot === target!.slot && x.status === "active");
    if (needed && !otherCover && !str(a.waiver_approver).trim()) return bad("This is the only test for a required slot: retiring it needs a named approver");
    return { ok: true, kind: "retired", payload: { id: a.id, reason: a.reason.trim(), ...(a.waiver_approver ? { waiver_approver: a.waiver_approver } : {}), by } };
  }

  if (a.type === "restore") {
    if (target!.status !== "retired") return bad("Only a retired test can be restored");
    return { ok: true, kind: "restored", payload: { id: a.id, reason: str(a.reason).trim(), by } };
  }

  if (a.type === "approve") {
    if (inForce(state)) return bad("This version is already approved and nothing has changed since");
    const c = coverage(state.blueprints, required);
    if (c.gaps.length) return bad(`The set is not approvable yet: ${c.gaps.slice(0, 3).map((g) => g.message).join("; ")}${c.gaps.length > 3 ? `; and ${c.gaps.length - 3} more` : ""}`);
    const own = !!by && state.authors.includes(by);
    if (own && !str(a.self_approval_reason).trim()) return bad("You changed this set, so you cannot also approve it unless you give the reason (recorded in the log)");
    return {
      ok: true, kind: "approved",
      payload: { version: state.version + 1, hash: testSetHash(state.blueprints), approver: a.approver.title, approver_source: a.approver.source, ...(a.note ? { note: a.note } : {}), ...(own ? { self_approval_reason: a.self_approval_reason!.trim() } : {}), by },
    };
  }

  // withdraw
  if (!state.approved) return bad("There is no approval to withdraw");
  if (str(a.reason).trim().length < 3) return bad("Withdrawing an approval needs a reason");
  return { ok: true, kind: "withdrawn", payload: { version: state.approved.version, reason: a.reason.trim(), by } };
}

export const appendTest = (prev: TestEntry | null, kind: TestKind, actor: string, payload: Record<string, unknown>, at: string): TestEntry => appendEntry<TestKind>(prev, kind, actor, payload, at);
export const verifyTest = (entries: TestEntry[]) => verifyChain(entries);

/** Everything a screen or a route needs to know about the current set. */
export function review(state: TestSetState, required: Blueprint[]): { gaps: Gap[]; covered: number; total: number; approvable: boolean; inForce: boolean } {
  const c = coverage(state.blueprints, required);
  return { ...c, approvable: state.exists && approvable(state.blueprints, required), inForce: inForce(state) };
}
