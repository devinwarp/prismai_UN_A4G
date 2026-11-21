// Roles, permissions and scope. Pure: no I/O.
//
// Until now access was one flag: admin (everything) or viewer (read-only). This module adds roles that can be
// held for the whole organisation or for one use case, so the process owner of UC02 can approve changes to UC02
// and nothing else. It is built to be introduced without breaking anything:
//   - a legacy `admin` still holds every role at organisation scope (a transition rule, see LEGACY below);
//   - a legacy `viewer` can only view;
//   - every action other than "view" is denied to a viewer, which a test checks for the whole table.
// Real assignments come from supabase/un-roles.sql (not applied yet). In offline mode a persona can be chosen with
// OFFLINE_ROLE (demo only). Which person holds a title comes from the org chart; the minimum org chart is the
// `job_title` already on each profile (holdersOfTitle below).

export const ROLES = ["platform_admin", "governance_admin", "process_owner", "test_author", "operator", "viewer"] as const;
export type RoleId = (typeof ROLES)[number];

export type Scope = { kind: "org" } | { kind: "use_case"; use_case_id: string };
export interface Assignment { role: RoleId; scope: Scope }

/** What a role may do. "scoped" actions belong to one use case; the rest are organisation-wide. */
export interface ActionDef { label: string; scoped: boolean; roles: RoleId[]; wired: boolean }

const def = (label: string, scoped: boolean, roles: RoleId[], wired = false): ActionDef => ({ label, scoped, roles, wired });

export const ACTIONS = {
  view: def("Read anything the organisation can see", false, ["platform_admin", "governance_admin", "process_owner", "test_author", "operator", "viewer"], true),
  // gates and governance
  "gate.add": def("Add a gate to a use case", true, ["process_owner"], true),
  "gate.waive": def("Waive a gate for a use case", true, ["process_owner"], true),
  "gate.catalogue.change": def("Add or change a gate in the org-wide catalogue", false, ["governance_admin"], true),
  "policy.edit": def("Edit the adoption target, counting rule and human-in-the-loop rules", false, ["governance_admin"]),
  // approval and the pilot
  "tuning.approve": def("Sign or withhold approval of a certified agent version", true, ["process_owner"], true),
  "run.sign": def("Sign a scenario run's verdict", true, ["process_owner"]),
  "tuning.run": def("Run pilot evals and tuning cycles", true, ["operator"], true),
  "tuning.propose": def("Propose a change to rules, glossary, settings or questions", true, ["test_author", "operator"]),
  "pilot.run": def("Run the approved pilot tests and have the model judge goal alignment", true, ["operator"], true),
  "goals.approve": def("Approve, override or withdraw the model's goal-alignment judgments of a pilot", true, ["process_owner"], true),
  // production
  "deploy": def("Deploy an approved agent version", true, ["operator"], true),
  "watchdog.window": def("Run a production monitoring window", true, ["operator"], true),
  "reinstate": def("Reinstate a taken-down agent, with a comment", true, ["process_owner"], true),
  // tests and scenarios (the editor is not built yet)
  "scenario.propose": def("Propose a scenario", true, ["test_author", "process_owner"]),
  "scenario.edit": def("Add, edit or retire a scenario", true, ["process_owner"], true),
  "scenario.approve": def("Approve and lock a test set and its verdict parameters", true, ["process_owner"], true),
  // people
  "users.manage": def("Assign roles to people", false, ["platform_admin"]),
} as const satisfies Record<string, ActionDef>;

export type ActionId = keyof typeof ACTIONS;

export interface Subject {
  /** profiles.role as stored today: platform | admin | employee | viewer, or (offline demo only) a role id. */
  legacyRole: string | null;
  assignments: Assignment[];
}

export interface Context { use_case_id?: string }
export type Decision = { ok: true; via: string } | { ok: false; reason: string };

// LEGACY: while nobody has assignments, `admin` must keep working exactly as before. It therefore holds every
// role at organisation scope. Remove this when role assignments are in use for real.
const LEGACY_ADMIN: RoleId[] = ["platform_admin", "governance_admin", "process_owner", "operator", "test_author"];

/** The assignments a subject effectively has, including those implied by the stored legacy role. */
export function effectiveAssignments(s: Subject): Assignment[] {
  const out = [...s.assignments];
  const org = (role: RoleId): Assignment => ({ role, scope: { kind: "org" } });
  if (s.legacyRole === "admin" || s.legacyRole === "platform") for (const r of LEGACY_ADMIN) out.push(org(r));
  else if (s.legacyRole === "viewer" || s.legacyRole === "employee") out.push(org("viewer")); // read-only, as before
  else if (s.legacyRole && (ROLES as readonly string[]).includes(s.legacyRole)) out.push(org(s.legacyRole as RoleId)); // offline demo personas
  return out;
}

const covers = (a: Assignment, scoped: boolean, ctx: Context) =>
  a.scope.kind === "org" || (scoped && !!ctx.use_case_id && a.scope.use_case_id === ctx.use_case_id);

/** May the subject do the action, here? A use-case-scoped action needs the use case's id; an organisation-wide one
 * needs an organisation-scoped role, never a role held for one use case. */
export function can(s: Subject, action: ActionId, ctx: Context = {}): Decision {
  const a = ACTIONS[action];
  const mine = effectiveAssignments(s);
  if (!mine.length) return { ok: false, reason: "Forbidden" };
  if (a.scoped && !ctx.use_case_id) return { ok: false, reason: "This action needs a use case" };
  const hit = mine.find((m) => (a.roles as readonly RoleId[]).includes(m.role) && covers(m, a.scoped, ctx));
  if (hit) return { ok: true, via: hit.role };
  const onlyViewer = mine.every((m) => m.role === "viewer");
  return { ok: false, reason: onlyViewer ? "Read-only access (judge/viewer)" : `Your role does not allow: ${a.label.toLowerCase()}` };
}

/** Separation of duties: the person who made a change cannot be the one who approves it. */
export const sameAuthorAndApprover = (authorId: string | null | undefined, approverId: string | null | undefined): boolean =>
  !!authorId && !!approverId && authorId === approverId;

// ---- org chart, minimum version ---------------------------------------------------------------

export interface Person { id: string; email?: string | null; job_title: string | null }

/** The people who hold a job title: case-insensitive match on the title kept on their profile. */
export const holdersOfTitle = (people: Person[], title: string): Person[] => {
  const t = title.trim().toLowerCase();
  return t ? people.filter((p) => (p.job_title ?? "").trim().toLowerCase() === t) : [];
};
