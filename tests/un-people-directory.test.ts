import test from "node:test";
import assert from "node:assert/strict";
import { isSuperUser, scopePeople } from "../src/lib/un/people-directory.ts";
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
