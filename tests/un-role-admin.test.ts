import assert from "node:assert/strict";
import test from "node:test";
import { planGrant, type AssignmentRow } from "../src/lib/un/role-admin.ts";

const ME = "u-admin", ANA = "u-ana", UC = "uc-1";
const row = (o: Partial<AssignmentRow>): AssignmentRow => ({ id: "a1", user_id: ANA, role: "operator", use_case_id: null, granted_by: ME, granted_at: "2026-11-21T10:00:00Z", revoked_at: null, revoked_by: null, ...o });
const ctx = (rows: AssignmentRow[] = []) => ({ rows, knownUsers: [ME, ANA], knownUseCases: [UC], by: ME });
const err = (p: ReturnType<typeof planGrant>) => (p.ok ? "" : p.error);

test("grant: a known role to a known person, for the organisation or for one use case", () => {
  assert.deepEqual(planGrant({ type: "grant", user_id: ANA, role: "process_owner", use_case_id: UC }, ctx()), { ok: true, type: "grant", row: { user_id: ANA, role: "process_owner", use_case_id: UC, granted_by: ME } });
  assert.equal(planGrant({ type: "grant", user_id: ANA, role: "viewer", use_case_id: null }, ctx()).ok, true);
});

test("grant: refused for an unknown role, person or use case, and for org-only roles at a use case", () => {
  assert.match(err(planGrant({ type: "grant", user_id: ANA, role: "root", use_case_id: null }, ctx())), /Unknown role/);
  assert.match(err(planGrant({ type: "grant", user_id: "nobody", role: "viewer", use_case_id: null }, ctx())), /not in this organisation/);
  assert.match(err(planGrant({ type: "grant", user_id: ANA, role: "viewer", use_case_id: "uc-x" }, ctx())), /use case is not/);
  for (const role of ["platform_admin", "governance_admin"]) assert.match(err(planGrant({ type: "grant", user_id: ANA, role, use_case_id: UC }, ctx())), /whole organisation/);
  assert.equal(planGrant({ type: "grant", user_id: ANA, role: "governance_admin", use_case_id: null }, ctx()).ok, true);
});

test("grant: once per person, role and scope; a revoked one can be granted again; another scope is a different grant", () => {
  const live = [row({})];
  assert.match(err(planGrant({ type: "grant", user_id: ANA, role: "operator", use_case_id: null }, ctx(live))), /already holds/);
  assert.equal(planGrant({ type: "grant", user_id: ANA, role: "operator", use_case_id: UC }, ctx(live)).ok, true);
  assert.equal(planGrant({ type: "grant", user_id: ANA, role: "operator", use_case_id: null }, ctx([row({ revoked_at: "2026-11-21T11:00:00Z", revoked_by: ME })])).ok, true);
});

test("nobody changes their own roles", () => {
  assert.match(err(planGrant({ type: "grant", user_id: ME, role: "viewer", use_case_id: null }, ctx())), /own roles/);
  assert.match(err(planGrant({ type: "revoke", assignment_id: "mine" }, ctx([row({ id: "mine", user_id: ME })]))), /own roles/);
});

test("revoke: a live assignment of someone else; not a missing or an already revoked one", () => {
  assert.deepEqual(planGrant({ type: "revoke", assignment_id: "a1" }, ctx([row({})])), { ok: true, type: "revoke", assignment_id: "a1", revoked_by: ME });
  assert.match(err(planGrant({ type: "revoke", assignment_id: "zz" }, ctx([row({})]))), /does not exist/);
  assert.match(err(planGrant({ type: "revoke", assignment_id: "a1" }, ctx([row({ revoked_at: "2026-11-21T11:00:00Z" })]))), /already revoked/);
});
