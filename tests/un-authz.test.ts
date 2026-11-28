import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { ACTIONS, can, effectiveAssignments, holdersOfTitle, ROLES, sameAuthorAndApprover, type ActionId, type Assignment, type RoleId, type Subject } from "../src/lib/un/authz.ts";

const UC02 = "a2aba320-164e-401e-9b0d-bcb50bb7f6d8";
const UC01 = "f55a2ed2-2a43-489c-950f-f796b667cd42";
const org = (role: RoleId): Assignment => ({ role, scope: { kind: "org" } });
const onlyUc = (role: RoleId, use_case_id: string): Assignment => ({ role, scope: { kind: "use_case", use_case_id } });
const subject = (...assignments: Assignment[]): Subject => ({ legacyRole: null, assignments });
// the place an action happens: the use case, its entity and the country the entity is linked to
const at = (uc: string | undefined = UC02, entity = "Marsa", country = "UAE") => ({ use_case_id: uc, entity, country });
const allowed = (s: Subject, a: ActionId, uc: string | undefined = UC02) => can(s, a, at(uc)).ok;

// The whole table, written out, so a change to who may do what shows up in review as a change to this test.
const EXPECTED: Record<RoleId, ActionId[]> = {
  platform_admin: ["view", "users.manage", "risk.edit", "entity.setup", "entity.people", "user.create"],
  governance_admin: ["view", "gate.catalogue.change", "policy.edit", "rerun.run", "sop.change.apply", "risk.edit", "scenario.approve", "contract.approve"],
  entity_admin: ["view", "risk.edit", "tuning.run", "tuning.propose", "pilot.run", "deploy", "watchdog.window", "rerun.run", "sop.change.apply", "scenario.propose", "scenario.edit", "contract.edit", "entity.setup", "entity.people", "user.create"],
  process_owner: ["view", "gate.add", "gate.waive", "tuning.approve", "tuning.run", "autotune.switch", "tuning.decide", "run.sign", "reinstate", "scenario.propose", "scenario.edit", "goals.approve", "rerun.request", "sop.change.request", "risk.edit", "contract.edit", "contract.approve"],
  test_author: ["view", "tuning.propose", "scenario.propose"],
  operator: ["view", "tuning.run", "tuning.propose", "pilot.run", "deploy", "watchdog.window", "rerun.run", "sop.change.apply", "contract.edit", "contract.approve"],
  viewer: ["view"],
};

test("the permission table: each role can do exactly what the plan says, and nothing else", () => {
  for (const role of ROLES) {
    const got = (Object.keys(ACTIONS) as ActionId[]).filter((a) => allowed(subject(org(role)), a)).sort();
    assert.deepEqual(got, [...EXPECTED[role]].sort(), role);
  }
});

test("a viewer (the judge role) can do nothing but view, for every action in the table", () => {
  for (const a of Object.keys(ACTIONS) as ActionId[]) {
    const d = can({ legacyRole: "viewer", assignments: [] }, a, at());
    assert.equal(d.ok, a === "view", a);
    if (!d.ok) assert.equal(d.reason, "Read-only access (judge/viewer)");
  }
});

test("a legacy admin still can do everything it could before, so introducing roles breaks nothing", () => {
  for (const a of Object.keys(ACTIONS) as ActionId[]) assert.equal(can({ legacyRole: "admin", assignments: [] }, a, at()).ok, true, a);
  assert.equal(can({ legacyRole: "platform", assignments: [] }, "gate.catalogue.change").ok, true);
});

test("a legacy employee is read-only, and a person with no role at all is refused everything", () => {
  assert.equal(can({ legacyRole: "employee", assignments: [] }, "view").ok, true);
  assert.equal(can({ legacyRole: "employee", assignments: [] }, "gate.add", { use_case_id: UC02 }).ok, false);
  assert.deepEqual(can({ legacyRole: null, assignments: [] }, "view"), { ok: false, reason: "Forbidden" });
});

test("scope: the process owner of one use case can act on that use case and on no other", () => {
  const s = subject(onlyUc("process_owner", UC02));
  assert.equal(allowed(s, "gate.add", UC02), true);
  assert.equal(allowed(s, "tuning.approve", UC02), true);
  assert.equal(allowed(s, "gate.add", UC01), false);
  assert.equal(allowed(s, "tuning.approve", UC01), false);
  // an action on a use case with no use case named is refused, not guessed
  assert.deepEqual(can(s, "gate.add"), { ok: false, reason: "This action needs a use case" });
});

test("an organisation-wide action cannot be satisfied by a role held for one use case", () => {
  assert.equal(allowed(subject(onlyUc("governance_admin", UC02)), "gate.catalogue.change", UC02), false);
  assert.equal(allowed(subject(org("governance_admin")), "gate.catalogue.change", undefined), true);
});

test("holding the wrong role is refused with a reason that names what was attempted", () => {
  const d = can(subject(org("test_author")), "tuning.approve", { use_case_id: UC02 });
  assert.equal(d.ok, false);
  assert.match((d as { reason: string }).reason, /sign or withhold approval/i);
  // an author may propose but not approve
  assert.equal(allowed(subject(org("test_author")), "scenario.propose"), true);
  assert.equal(allowed(subject(org("test_author")), "scenario.approve"), false);
});

test("offline demo personas: a role id in the stored role works as an organisation-wide role", () => {
  assert.deepEqual(effectiveAssignments({ legacyRole: "process_owner", assignments: [] }), [org("process_owner")]);
  assert.equal(can({ legacyRole: "operator", assignments: [] }, "deploy", { use_case_id: UC02 }).ok, true);
  assert.equal(can({ legacyRole: "operator", assignments: [] }, "tuning.approve", { use_case_id: UC02 }).ok, false);
  assert.deepEqual(effectiveAssignments({ legacyRole: "nonsense", assignments: [] }), []);
});

test("a person may hold several roles, and each adds to what they can do", () => {
  const both = subject(org("operator"), onlyUc("process_owner", UC02));
  assert.equal(allowed(both, "deploy", UC01), true);
  assert.equal(allowed(both, "tuning.approve", UC02), true);
  assert.equal(allowed(both, "tuning.approve", UC01), false);
});

test("the org chart minimum: who holds a title is read from the job title on the profile, case-insensitively", () => {
  const people = [
    { id: "1", job_title: "Head of Licensing" },
    { id: "2", job_title: "  licensing supervisor " },
    { id: "3", job_title: null },
    { id: "4", job_title: "Licensing Supervisor" },
  ];
  assert.deepEqual(holdersOfTitle(people, "Head of Licensing").map((p) => p.id), ["1"]);
  assert.deepEqual(holdersOfTitle(people, "LICENSING SUPERVISOR").map((p) => p.id), ["2", "4"]);
  assert.deepEqual(holdersOfTitle(people, ""), []);
  assert.deepEqual(holdersOfTitle(people, "Nobody"), []);
});

test("separation of duties: the author of a change is not its approver", () => {
  assert.equal(sameAuthorAndApprover("u1", "u1"), true);
  assert.equal(sameAuthorAndApprover("u1", "u2"), false);
  assert.equal(sameAuthorAndApprover(null, "u2"), false);
  assert.equal(sameAuthorAndApprover("u1", undefined), false);
});

// ---- the table and the routes agree ---------------------------------------------------------------

const routeFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? routeFiles(`${dir}/${e.name}`) : e.name === "route.ts" ? [`${dir}/${e.name}`] : []));

test("the routes check exactly the actions marked wired, and a use-case action always names its use case", () => {
  const used = new Set<string>();
  for (const file of routeFiles("src/app/api")) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/requirePermission\(([^;]*?)\);/g)) {
      const names = [...m[1].matchAll(/"([a-z.]+)"/g)].map((x) => x[1]);
      assert.ok(names.length > 0, `${file}: requirePermission names no action`);
      for (const n of names) {
        assert.ok(n in ACTIONS, `${file}: "${n}" is not an action in authz.ts`);
        used.add(n);
      }
      if (names.some((n) => ACTIONS[n as ActionId].scoped)) assert.match(m[1], /useCaseId/, `${file}: a use-case action must pass the use case id`);
      if (names.some((n) => ACTIONS[n as ActionId].level === "entity")) assert.match(m[1], /useCaseId|entity/, `${file}: an entity action must name its entity (or the use case it is for)`);
    }
    for (const m of src.matchAll(/decide\("([a-z.]+)"\)/g)) {
      assert.ok(m[1] in ACTIONS, `${file}: decide("${m[1]}") is not an action`);
      used.add(m[1]);
    }
  }
  const wired = (Object.keys(ACTIONS) as ActionId[]).filter((a) => ACTIONS[a].wired && a !== "view").sort();
  used.delete("view"); // reading is checked by read-only routes too; it is not one of the actions that change something
  assert.deepEqual([...used].sort(), wired);
});

// ---- country and entity scopes ------------------------------------------------------------------------------------------------------------

const inCountry = (role: RoleId, country: string): Assignment => ({ role, scope: { kind: "country", country } });
const inEntity = (role: RoleId, entity: string, country?: string): Assignment => ({ role, scope: { kind: "entity", entity, country } });

test("a governance admin held for a country approves targets and test sets for every entity of that country, and for no other country", () => {
  const s = subject(inCountry("governance_admin", "UAE"));
  assert.equal(can(s, "scenario.approve", at(UC02, "Marsa", "UAE")).ok, true);
  assert.equal(can(s, "scenario.approve", at(UC01, "Wahat", "UAE")).ok, true, "another entity of the same country");
  assert.equal(can(s, "scenario.approve", at(UC02, "Marsa", "SG")).ok, false, "a use case in another country");
  assert.equal(can(s, "scenario.approve", { use_case_id: UC02 }).ok, false, "no country known: refused, not guessed");
});

test("a country governance admin cannot do what needs the organisation: the gate catalogue and role administration", () => {
  const s = subject(inCountry("governance_admin", "UAE"));
  assert.equal(can(s, "gate.catalogue.change", at()).ok, false);
  assert.equal(can(s, "users.manage", at()).ok, false);
});

test("the process owner who proposes cannot approve targets and test sets: that is the governance admin's", () => {
  const owner = subject(onlyUc("process_owner", UC02));
  assert.equal(can(owner, "scenario.edit", at()).ok, true, "proposes");
  assert.equal(can(owner, "scenario.approve", at()).ok, false, "does not approve");
  assert.equal(can(subject(org("process_owner")), "scenario.approve", at()).ok, false);
});

test("an entity admin sets up and runs one entity, in its country, and approves nothing", () => {
  const s = subject(inEntity("entity_admin", "Marsa", "UAE"));
  for (const a of ["entity.setup", "entity.people", "user.create", "scenario.edit", "pilot.run", "deploy", "tuning.run"] as ActionId[]) assert.equal(can(s, a, at(UC02, "Marsa", "UAE")).ok, true, a);
  for (const a of ["entity.setup", "scenario.edit", "deploy"] as ActionId[]) assert.equal(can(s, a, at(UC01, "Wahat", "UAE")).ok, false, `${a} on another entity`);
  assert.equal(can(s, "entity.setup", at(UC02, "Marsa", "SG")).ok, false, "the same entity name in another country");
  for (const a of ["scenario.approve", "tuning.approve", "run.sign", "goals.approve", "gate.waive", "gate.catalogue.change", "users.manage"] as ActionId[]) assert.equal(can(s, a, at(UC02, "Marsa", "UAE")).ok, false, `${a} is not an entity admin's`);
});

test("an entity action names its entity, and a role held for one use case never reaches an entity action", () => {
  assert.deepEqual(can(subject(org("entity_admin")), "entity.setup"), { ok: false, reason: "This action needs an entity" });
  assert.equal(can(subject(onlyUc("entity_admin", UC02)), "entity.setup", at()).ok, false);
});
