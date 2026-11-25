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

const BOB = "u-bob", CAL = "u-cal";
const owner = (o: Partial<AssignmentRow> = {}) => row({ id: "po1", user_id: ANA, role: "process_owner", use_case_id: UC, ...o });
const ctx3 = (rows: AssignmentRow[]) => ({ rows, knownUsers: [ME, ANA, BOB, CAL], knownUseCases: [UC], by: ME });

test("grant: a use case with an active process owner requires replacement", () => {
  const grant = { type: "grant", user_id: BOB, role: "process_owner", use_case_id: UC } as const;
  assert.match(err(planGrant(grant, ctx3([owner()]))), /Use Replace/);
  assert.equal(planGrant(grant, ctx3([owner({ revoked_at: "2026-11-21T11:00:00Z" })])).ok, true);
  assert.equal(planGrant(grant, ctx3([owner({ use_case_id: "uc-other" })])).ok, true);
  assert.equal(planGrant({ ...grant, role: "operator" }, ctx3([owner()])).ok, true);
});

test("the process owner is never just removed: a bare revoke is refused, whoever asks", () => {
  assert.match(err(planGrant({ type: "revoke", assignment_id: "po1" }, ctx3([owner()]))), /process owner cannot be removed on their own: replace them/);
  assert.match(err(planGrant({ type: "revoke", assignment_id: "po1" }, ctx3([owner({ use_case_id: null })]))), /cannot be removed on their own/, "for the whole organisation too");
  // the other roles are removed as before
  assert.equal(planGrant({ type: "revoke", assignment_id: "op1" }, ctx3([row({ id: "op1", role: "operator" })])).ok, true);
  assert.equal(planGrant({ type: "revoke", assignment_id: "t1" }, ctx3([row({ id: "t1", role: "test_author" })])).ok, true);
});

test("replacing the process owner gives the role to the new person for the same scope and takes it from the old, in one plan", () => {
  const p = planGrant({ type: "replace_process_owner", assignment_id: "po1", user_id: BOB }, ctx3([owner()]));
  assert.deepEqual(p, { ok: true, type: "replace", grant: { user_id: BOB, role: "process_owner", use_case_id: UC, granted_by: ME }, revoke: { assignment_id: "po1", revoked_by: ME } });
  const org = planGrant({ type: "replace_process_owner", assignment_id: "po1", user_id: BOB }, ctx3([owner({ use_case_id: null })]));
  assert.ok(org.ok && org.type === "replace" && org.grant.use_case_id === null);
});

test("replacing is refused for a missing, revoked or non-owner assignment, the same person, someone already an owner there, an unknown person, or oneself", () => {
  const r = (a: { assignment_id?: string; user_id?: string }, rows = [owner()]) => err(planGrant({ type: "replace_process_owner", assignment_id: "po1", user_id: BOB, ...a }, ctx3(rows)));
  assert.match(r({ assignment_id: "zz" }), /does not exist/);
  assert.match(r({}, [owner({ revoked_at: "2026-11-21T11:00:00Z" })]), /already revoked/);
  assert.match(r({}, [owner({ role: "operator" })]), /Only a process owner is replaced this way/);
  assert.match(r({ user_id: ANA }), /different person/);
  assert.match(r({ user_id: "nobody" }), /not in this organisation/);
  assert.match(r({ user_id: ME }), /own roles/);
  assert.match(r({}, [owner({ user_id: ME })]), /own roles/, "an administrator who is the owner cannot remove themselves");
  assert.match(r({}, [owner(), row({ id: "po2", user_id: BOB, role: "process_owner", use_case_id: UC })]), /already a process owner for this scope/);
  assert.equal(r({}, [owner(), row({ id: "po3", user_id: BOB, role: "process_owner", use_case_id: "uc-other" })]), "", "an owner of another process may take this one");
});

test("who may switch the tuning agent's automatic changes: only the process owner, for the use case; operators and the owner run cycles", async () => {
  const { can } = await import("../src/lib/un/authz.ts");
  const as = (role: "process_owner" | "operator" | "test_author" | "viewer" | "platform_admin" | "governance_admin", use_case_id = UC) => ({ legacyRole: null, assignments: [{ role, scope: { kind: "use_case" as const, use_case_id } }] });
  assert.equal(can(as("process_owner"), "autotune.switch", { use_case_id: UC }).ok, true);
  for (const role of ["operator", "test_author", "viewer"] as const) assert.equal(can(as(role), "autotune.switch", { use_case_id: UC }).ok, false, role);
  assert.equal(can(as("process_owner", "uc-other"), "autotune.switch", { use_case_id: UC }).ok, false, "the owner of another process cannot");
  assert.equal(can(as("operator"), "tuning.run", { use_case_id: UC }).ok, true);
  assert.equal(can(as("process_owner"), "tuning.run", { use_case_id: UC }).ok, true);
  assert.equal(can(as("test_author"), "tuning.run", { use_case_id: UC }).ok, false);
  assert.equal(can(as("process_owner"), "tuning.decide", { use_case_id: UC }).ok, true);
  assert.equal(can(as("operator"), "tuning.decide", { use_case_id: UC }).ok, false);
});
