import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COUNTRY, ENTITIES, OPERATORS, planRoster, ROSTER, UNFILLED, type RosterPerson } from "../src/lib/un/test-roster.ts";

const useCases = OPERATORS.map((o, i) => ({ id: `uc-${i + 1}`, ext_id: o.uc }));

test("the roster: 29 fictitious people with the job positions the approver lists and SOPs match on, and five operator positions left unfilled", () => {
  assert.equal(ROSTER.length, 29);
  assert.equal(new Set(ROSTER.map((p) => p.email)).size, ROSTER.length, "no email twice");
  assert.ok(ROSTER.every((p) => p.email.endsWith(".example") && p.job_title && p.name), "fictitious addresses, a position and a name for each");
  assert.equal(ROSTER.find((p) => p.email === "ai.governance.uae@federal.example")?.job_title, "Head of AI governance", "exactly the title the approver list uses");
  assert.deepEqual(UNFILLED.map((o) => o.uc), ["UC04", "UC07", "UC11", "UC15", "UC19"]);
  assert.equal(OPERATORS.length, 20);
  const byRole = (r: string) => ROSTER.filter((p) => p.roles.some((x) => x.role === r)).length;
  assert.deepEqual([byRole("entity_admin"), byRole("test_author"), byRole("operator"), byRole("governance_admin"), byRole("platform_admin")], [5, 5, 15, 1, 2]);
  assert.equal(ROSTER.filter((p) => p.legacy === "platform").length, 1, "one federal super admin");
  assert.equal(ROSTER.find((p) => p.legacy === "viewer")?.email, "judge@demo.example");
  for (const e of ENTITIES) assert.ok(ROSTER.some((p) => p.email === `ai.director@${e.slug}.example`), `an entity admin for ${e.name}`);
  assert.equal(COUNTRY, "UAE");
});

test("planning against an empty project creates everyone and every role, and skips operators of use cases that do not exist", () => {
  const all = planRoster({ profiles: [], assignments: [], members: [], useCases });
  assert.equal(all.create.length, 29);
  assert.equal(all.grants.length, 28, "every role: the judge has none, the super admin has one, the federal member is separate");
  assert.equal(all.members.length, 1);
  const entityGrant = all.grants.find((g) => g.email === "ai.director@marsa.example")!;
  assert.deepEqual([entityGrant.role, entityGrant.scope_entity, entityGrant.scope_country, entityGrant.use_case_id], ["entity_admin", "Marsa Public Services Authority", "UAE", null]);
  assert.deepEqual(all.grants.find((g) => g.role === "governance_admin"), { email: "ai.governance.uae@federal.example", role: "governance_admin", use_case_id: null, scope_entity: null, scope_country: "UAE", label: "governance_admin@country:UAE" });
  const none = planRoster({ profiles: [], assignments: [], members: [], useCases: [] });
  assert.equal(none.missingUseCases.length, 15, "the operators' 15 use cases");
  assert.equal(none.grants.length, 28 - 15);
});

test("running it again changes nothing: people who exist are kept and roles already held are not granted twice", () => {
  const first = planRoster({ profiles: [], assignments: [], members: [], useCases });
  const profiles = first.create.map((p, i) => ({ id: `p${i}`, email: p.email, job_title: p.job_title, role: p.legacy }));
  const idOf = (email: string) => profiles.find((p) => p.email === email)!.id;
  const assignments = first.grants.map((g) => ({ user_id: idOf(g.email), role: g.role, use_case_id: g.use_case_id, scope_entity: g.scope_entity, scope_country: g.scope_country }));
  const members = first.members.map((m) => ({ user_id: idOf(m.email), body: m.body }));
  const again = planRoster({ profiles, assignments, members, useCases });
  assert.deepEqual([again.create.length, again.grants.length, again.members.length], [0, 0, 0]);
  assert.equal(again.keep.length, 29);
});

test("an existing account keeps its login role, gets a missing job position filled, and a revoked role is granted again", () => {
  const one: RosterPerson[] = [ROSTER.find((p) => p.email === "ai.director@marsa.example")!];
  const plan = planRoster({
    roster: one, useCases,
    profiles: [{ id: "me", email: "AI.Director@Marsa.example", job_title: null, role: "admin" }],
    assignments: [{ user_id: "me", role: "entity_admin", use_case_id: null, scope_entity: "Marsa Public Services Authority", scope_country: "UAE", revoked_at: "2026-11-01" }],
    members: [],
  });
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.keep, [{ email: "ai.director@marsa.example", fillJobTitle: true }]);
  assert.equal(plan.grants.length, 1, "revoked: granted again");
});

test("the hosted run is safe by construction: it needs --apply and a credentials file outside the repository, checks the SQL, and never prints a password", () => {
  const src = readFileSync("scripts/seed-test-accounts.mts", "utf8");
  assert.match(src, /flag\("--apply"\)/);
  assert.match(src, /Refusing to --apply: apply supabase\/un-scoped-roles\.sql/);
  assert.match(src, /must be OUTSIDE this repository/);
  assert.match(src, /flag: "wx"/, "an earlier credentials file is never overwritten");
  assert.doesNotMatch(src, /console\.(log|error)\([^)]*\b(pw|password\(\))/, "no password reaches the console");
  assert.match(src, /if \(flag\("--check"\) \|\| !flag\("--apply"\)\)/, "without --apply it is a read-only dry run");
});
