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

export const ROLES = ["platform_admin", "governance_admin", "entity_admin", "process_owner", "test_author", "operator", "viewer"] as const;
export type RoleId = (typeof ROLES)[number];

/** Where a role is held. A country scope covers every entity linked to that country, an entity scope covers that entity's use cases (and its setup),
 * a use-case scope covers one use case. An organisation-wide action (the gate catalogue, role administration) needs an organisation scope. */
export type Scope =
  | { kind: "org" }
  | { kind: "country"; country: string }
  | { kind: "entity"; entity: string; country?: string }
  | { kind: "use_case"; use_case_id: string };
export interface Assignment { role: RoleId; scope: Scope }

/** What a role may do. "scoped" actions belong to one use case; `level: "entity"` actions belong to one entity (its setup and its people); the rest are
 * organisation-wide. */
export interface ActionDef { label: string; scoped: boolean; roles: RoleId[]; wired: boolean; level?: "entity" }

const def = (label: string, scoped: boolean, roles: RoleId[], wired = false): ActionDef => ({ label, scoped, roles, wired });
const entityDef = (label: string, roles: RoleId[], wired = false): ActionDef => ({ label, scoped: false, roles, wired, level: "entity" });

export const ACTIONS = {
  view: def("Read anything the organisation can see", false, ["platform_admin", "governance_admin", "entity_admin", "process_owner", "test_author", "operator", "viewer"], true),
  // gates and governance
  "gate.add": def("Add a gate to a use case", true, ["process_owner"], true),
  "gate.waive": def("Waive a gate for a use case", true, ["process_owner"], true),
  "risk.edit": def("Edit the risk flags for a use case", true, ["process_owner", "entity_admin", "governance_admin", "platform_admin"], true),
  "gate.catalogue.change": def("Add or change a gate in the org-wide catalogue", false, ["governance_admin"], true),
  "policy.edit": def("Edit the adoption target, counting rule and human-in-the-loop rules", false, ["governance_admin"]),
  // approval and the pilot
  "tuning.approve": def("Sign or withhold approval of a certified agent version", true, ["process_owner"], true),
  "run.sign": def("Sign a scenario run's verdict", true, ["process_owner"]),
  "tuning.run": def("Run pilot evals and tuning cycles", true, ["operator", "entity_admin", "process_owner"], true),
  "autotune.switch": def("Switch the tuning agent's automatic changes on or off, and set the limit above which every change waits for a person", true, ["process_owner"], true),
  "tuning.decide": def("Approve or reject a change the tuning agent proposes", true, ["process_owner"], true),
  "tuning.propose": def("Propose a change to rules, glossary, settings or questions", true, ["test_author", "operator", "entity_admin"]),
  "pilot.run": def("Run the approved pilot tests and have the model judge goal alignment", true, ["operator", "entity_admin"], true),
  "goals.approve": def("Approve, override or withdraw the model's goal-alignment judgments of a pilot", true, ["process_owner"], true),
  // production
  "deploy": def("Deploy an approved agent version", true, ["operator", "entity_admin"], true),
  "watchdog.window": def("Run a production monitoring window", true, ["operator", "entity_admin"], true),
  "reinstate": def("Reinstate a taken-down agent, with a comment", true, ["process_owner"], true),
  "sop.change.request": def("Ask to move a use case that is in production to a newer SOP version, with a reason and a plan", true, ["process_owner"], true),
  "sop.change.apply": def("Apply or decline a change of SOP version for a use case that is in production", true, ["operator", "entity_admin", "governance_admin"], true),
  "rerun.request": def("Request a rerun of a use case that is in production, with a reason", true, ["process_owner"], true),
  "rerun.run": def("Rerun a use case's verdict as a new run (one in production only after its process owner has requested it)", true, ["operator", "entity_admin", "governance_admin"], true),
  // tests and scenarios (the editor is not built yet)
  "scenario.propose": def("Propose a scenario", true, ["test_author", "entity_admin", "process_owner"], true),
  "scenario.edit": def("Add, edit or retire a scenario, a test set, its verdict parameters and the process targets (the business owner proposes)", true, ["process_owner", "entity_admin"], true),
  // The governance admin of the country approves; the process owner who proposes cannot (a legacy admin still holds every role).
  "scenario.approve": def("Approve and lock a test set, its verdict parameters and the process targets", true, ["governance_admin"], true),
  // people
  "users.manage": def("Assign roles to people", false, ["platform_admin"], true),
  // an entity: its setup and its people (the entity admin holds these for one entity only)
  "entity.setup": entityDef("Set up an entity: its goals and criteria, its use case list and its SOPs", ["entity_admin", "platform_admin"], true),
  "entity.people": entityDef("Give or take back roles for the people of an entity's use cases", ["entity_admin", "platform_admin"], true),
  "user.create": entityDef("Create a user for an entity (an agent only stages one; a person confirms)", ["entity_admin", "platform_admin"], true),
} as const satisfies Record<string, ActionDef>;

export type ActionId = keyof typeof ACTIONS;

export interface Subject {
  /** profiles.role as stored today: platform | admin | employee | viewer, or (offline demo only) a role id. */
  legacyRole: string | null;
  assignments: Assignment[];
}

/** Where the action happens. A use-case action names its use case and, for entity and country scopes to apply, that use case's entity and its country. */
export interface Context { use_case_id?: string; entity?: string; country?: string }
export type Decision = { ok: true; via: string } | { ok: false; reason: string };

// LEGACY: while nobody has assignments, `admin` must keep working exactly as before. It therefore holds every
// role at organisation scope. Remove this when role assignments are in use for real.
const LEGACY_ADMIN: RoleId[] = ["platform_admin", "governance_admin", "entity_admin", "process_owner", "operator", "test_author"];

/** The assignments a subject effectively has, including those implied by the stored legacy role. */
export function effectiveAssignments(s: Subject): Assignment[] {
  const out = [...s.assignments];
  const org = (role: RoleId): Assignment => ({ role, scope: { kind: "org" } });
  if (s.legacyRole === "admin" || s.legacyRole === "platform") for (const r of LEGACY_ADMIN) out.push(org(r));
  else if (s.legacyRole === "viewer" || s.legacyRole === "employee") out.push(org("viewer")); // read-only, as before
  else if (s.legacyRole && (ROLES as readonly string[]).includes(s.legacyRole)) out.push(org(s.legacyRole as RoleId)); // offline demo personas
  return out;
}

const sameCountry = (scoped: string | undefined, ctx: string | undefined) => !scoped || !ctx || scoped === ctx;

/** Does this assignment reach the place the action happens? Organisation scope reaches everything. An organisation-wide action is never reached by a
 * narrower scope; an entity action by an entity or country scope; a use-case action by a use-case, entity or country scope. */
const covers = (a: Assignment, d: ActionDef, ctx: Context): boolean => {
  const s = a.scope;
  if (s.kind === "org") return true;
  if (!d.scoped && d.level !== "entity") return false;
  if (s.kind === "use_case") return d.scoped && !!ctx.use_case_id && s.use_case_id === ctx.use_case_id;
  if (s.kind === "entity") return !!ctx.entity && s.entity === ctx.entity && sameCountry(s.country, ctx.country);
  return !!ctx.country && s.country === ctx.country;
};

/** May the subject do the action, here? A use-case-scoped action needs the use case's id; an organisation-wide one
 * needs an organisation-scoped role, never a role held for one use case. */
export function can(s: Subject, action: ActionId, ctx: Context = {}): Decision {
  const a = ACTIONS[action];
  const mine = effectiveAssignments(s);
  if (!mine.length) return { ok: false, reason: "Forbidden" };
  if (a.scoped && !ctx.use_case_id) return { ok: false, reason: "This action needs a use case" };
  if (a.level === "entity" && !ctx.entity) return { ok: false, reason: "This action needs an entity" };
  const hit = mine.find((m) => (a.roles as readonly RoleId[]).includes(m.role) && covers(m, a, ctx));
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
