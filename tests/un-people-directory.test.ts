import test from "node:test";
import assert from "node:assert/strict";
import { canCompareCountries, isSuperUser, scopePeople } from "../src/lib/un/people-directory.ts";
import type { AssignmentRow } from "../src/lib/un/role-admin.ts";

const assignment = (userId: string, useCaseId: string, revokedAt: string | null = null): AssignmentRow => ({
  id: `${userId}-${useCaseId}`, user_id: userId, role: "operator", use_case_id: useCaseId,
  granted_at: "2026-04-23", granted_by: "admin", revoked_at: revokedAt, revoked_by: null,
});
const data = {
  people: ["staff", "colleague", "other", "federal", "admin"].map((id) => ({
    id, email: null, job_title: null, legacy_role: id === "admin" ? "admin" : "employee",
  })),
  rows: [
    assignment("staff", "UC02"), assignment("staff", "UC03", "2026-04-24"),
    assignment("colleague", "UC02"), assignment("colleague", "UC03"),
    assignment("other", "UC03"), assignment("federal", "UC02"), assignment("admin", "UC02"),
  ],
  useCases: [{ id: "UC02" }, { id: "UC03" }],
  federal: [{
    id: "membership", user_id: "federal", body: "Federal authority",
    added_by: "admin", added_at: "2026-04-23", removed_at: null, removed_by: null,
  }],
};

test("staff can see their own history and teammates on active use cases only", () => {
  const view = scopePeople(data, "staff", "employee");
  assert.deepEqual(view.people.map((person) => person.id), ["staff", "colleague"]);
  assert.deepEqual(view.useCases.map((useCase) => useCase.id), ["UC02"]);
  assert.deepEqual(view.rows.map((row) => row.id), ["staff-UC02", "staff-UC03", "colleague-UC02"]);
  assert.equal(view.rows[0].granted_by, null);
  assert.equal(view.mayManage, false);
});

test("active federal membership grants directory visibility without permission to change roles", () => {
  const federal = scopePeople(data, "federal", "employee");
  assert.equal(federal.people.length, data.people.length);
  assert.equal(federal.mayManage, false);
  const removed = scopePeople({ ...data, federal: [{ ...data.federal[0], removed_at: "2026-04-24" }] }, "federal", "employee");
  assert.equal(removed.federalMember, false);
  assert(!removed.people.some((person) => person.id === "admin"));
  assert.equal(scopePeople(data, "admin", "admin").mayManage, true);
});

test("Compare is reserved for the designated platform account", () => {
  assert.equal(isSuperUser("designated", "platform", "designated"), true);
  assert.equal(isSuperUser("other", "platform", "designated"), false);
  assert.equal(isSuperUser("designated", "admin", "designated"), false);
  assert.equal(isSuperUser("designated", "platform", ""), false);
});

test("a read-only viewer (the judge account) can compare countries like the super user, and an ordinary employee cannot", () => {
  assert.equal(canCompareCountries("designated", "platform", "designated"), true);
  assert.equal(canCompareCountries("judge", "viewer", "designated"), true);
  assert.equal(canCompareCountries("someone", "employee", "designated"), false);
  assert.equal(canCompareCountries("someone", "admin", "designated"), false);
});

// ---- an entity admin sees everyone assigned in their own entity ----------------------------------------------------------------------------------------

test("an entity admin sees the people assigned in their entity, by an entity role or one of its use cases, and nothing of other entities", () => {
  const row = (id: string, user_id: string, role: string, extra: Partial<AssignmentRow> = {}): AssignmentRow => ({ id, user_id, role, use_case_id: null, granted_at: "2026-11-26", granted_by: null, revoked_at: null, revoked_by: null, ...extra });
  const entityData = {
    people: ["ea", "op-m", "author-m", "op-w", "gov", "root"].map((id) => ({ id, email: null, job_title: null, legacy_role: id === "root" ? "admin" : "employee" })),
    rows: [
      row("r1", "ea", "entity_admin", { scope_entity: "Marsa", scope_country: "UAE" }),
      row("r2", "op-m", "operator", { use_case_id: "UC02" }),
      row("r3", "author-m", "test_author", { scope_entity: "Marsa", scope_country: "UAE" }),
      row("r4", "op-w", "operator", { use_case_id: "UC05" }),
      row("r5", "gov", "governance_admin", { scope_country: "UAE" }),
      row("r6", "root", "operator", { use_case_id: "UC02" }),
    ],
    useCases: [{ id: "UC02", entity: "Marsa" }, { id: "UC05", entity: "Wahat" }],
    federal: [],
  };
  const view = scopePeople(entityData, "ea", "employee");
  assert.deepEqual(view.people.map((p) => p.id).sort(), ["author-m", "ea", "op-m"], "Marsa's people only: no Wahat operator, no governance admin, no administrator");
  assert.deepEqual(view.useCases.map((u) => u.id), ["UC02"]);
  assert.deepEqual(view.entityAdminOf, ["Marsa"]);
  assert.equal(view.mayManage, false);
  assert.deepEqual(view.rows.map((r) => r.id).sort(), ["r1", "r2", "r3"]);
  // an administrator is not an entity admin: they manage everyone
  assert.deepEqual(scopePeople(entityData, "root", "admin").entityAdminOf, []);
});
