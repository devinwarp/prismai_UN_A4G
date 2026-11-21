import assert from "node:assert/strict";
import test from "node:test";
import { loadSop } from "../src/lib/un/sop-kb.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { deriveTests, testSetHash, type Blueprint, type Check } from "../src/lib/un/test-derive.ts";
import { appendTest, EMPTY_TESTSET, inForce, plan, replayTestSet, review, verifyTest, type Action, type TestEntry } from "../src/lib/un/test-sets.ts";

const SOP = "SOP-LIC-014";
const DV = "Document Verification Analyst";
const chunks = loadSop(SOP).chunks;
const flags = Object.fromEntries(profilesOf(SOP)!.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }])));
const required: Blueprint[] = deriveTests({ sopId: SOP, profile: DV, chunks, flags });
const OWNER = { title: "Head of Licensing", source: "process_owner" };
const exp: Check[] = [{ kind: "rubric", text: "Does not approve the renewal" }];

/** A log built the way the route builds it: plan each action against the replayed state, then append. */
function build(...steps: [Action, string][]) {
  const log: TestEntry[] = [];
  let n = 0;
  for (const [a, by] of steps) {
    const p = plan(replayTestSet(log), required, a, by);
    assert.equal(p.ok, true, p.ok ? "" : p.error);
    if (p.ok) log.push(appendTest(log[log.length - 1] ?? null, p.kind, by, p.payload, `2026-11-21T10:00:${String(n++).padStart(2, "0")}Z`));
  }
  return log;
}
const refused = (log: TestEntry[], a: Action, by = "u1") => { const p = plan(replayTestSet(log), required, a, by); return p.ok ? "" : p.error; };
const create: [Action, string] = [{ type: "create", profile: DV, sop_id: SOP, required }, "system"];
const state = (log: TestEntry[]) => replayTestSet(log);

test("a set is created from the derived tests, once, and nothing works before that", () => {
  assert.match(refused([], { type: "retire", id: "T04.happy", reason: "no longer needed" }), /Create the test set first/);
  const log = build(create);
  const s = state(log);
  assert.equal(s.exists, true);
  assert.equal(s.blueprints.length, required.length);
  assert.equal(s.draft, true);
  assert.deepEqual(s.authors, []); // the system deriving the set is not an author
  assert.equal(inForce(s), false);
  assert.match(refused(log, { type: "create", profile: DV, sop_id: SOP, required }), /already exists/);
  assert.match(refused([], { type: "create", profile: DV, sop_id: SOP, required: [] }), /no tasks/);
});

test("adding a test: it needs a title, a family and an expected output; it gets its own id and is marked as manual", () => {
  const log = build(create);
  const add = (b: object) => refused(log, { type: "add", blueprint: b } as Action);
  assert.match(add({ title: "", family: "client_facing", expect: exp }), /title/);
  assert.match(add({ title: "x", family: "nonsense", expect: exp }), /family/);
  assert.match(add({ title: "x", family: "control", expect: [] }), /expected-output/);
  assert.match(add({ title: "x", family: "control", expect: [{ kind: "rubric", text: "  " }] }), /expected-output/);
  assert.match(add({ title: "x", family: "client_facing", scenario: "made_up", expect: exp }), /scenario/);
  const two = build(create, [{ type: "add", blueprint: { title: "Abusive applicant", family: "client_facing", task: "T10", scenario: "hostile", expect: exp } }, "u1"], [{ type: "add", blueprint: { title: "Another", family: "control", expect: exp } }, "u1"]);
  const s = state(two);
  const manual = s.blueprints.filter((b) => !b.derived);
  assert.deepEqual(manual.map((b) => b.id), ["manual.1", "manual.2"]);
  assert.ok(manual.every((b) => b.status === "active"));
  assert.deepEqual(s.authors, ["u1"]);
});

test("editing: title, expected output, gates and scenario only; what a derived test covers cannot be changed", () => {
  const log = build(create);
  assert.match(refused(log, { type: "edit", id: "T04.happy", changes: { title: "" } }), /title/);
  assert.match(refused(log, { type: "edit", id: "T04.happy", changes: {} }), /Nothing to change/);
  assert.match(refused(log, { type: "edit", id: "T04.happy", changes: { slot: "happy:T05" } as never }), /retire it and add another/);
  assert.match(refused(log, { type: "edit", id: "T10.cf.hostile", changes: { scenario: "language" } }), /scenario of a derived test/);
  assert.match(refused(log, { type: "edit", id: "no.such", changes: { title: "x" } }), /No such test/);
  const edited = build(create, [{ type: "edit", id: "T04.happy", changes: { title: "T04: a licence 12 days late" }, reason: "clearer" }, "u1"]);
  assert.equal(state(edited).blueprints.find((b) => b.id === "T04.happy")!.title, "T04: a licence 12 days late");
});

test("delete means retire: a reason is required, the only test for a required slot needs a named approver, and the history stays", () => {
  const log = build(create);
  assert.match(refused(log, { type: "retire", id: "T04.happy", reason: "" }), /needs a reason/);
  assert.match(refused(log, { type: "retire", id: "T04.happy", reason: "not needed" }), /only test for a required slot/);
  assert.match(refused(log, { type: "retire", id: "T04.happy", reason: "not needed", waiver_approver: "  " }), /only test for a required slot/);
  const retired = build(create, [{ type: "retire", id: "T04.happy", reason: "covered elsewhere", waiver_approver: "Head of Licensing" }, "u1"]);
  const b = state(retired).blueprints.find((x) => x.id === "T04.happy")!;
  assert.equal(b.status, "retired");
  assert.deepEqual(b.retired, { reason: "covered elsewhere", waiver_approver: "Head of Licensing" });
  assert.equal(retired.length, 2, "the log keeps both entries");
  // an owner-written test for the same slot means the derived one can go without a waiver
  const replaced = build(create,
    [{ type: "add", blueprint: { title: "Better T10 hostile test", family: "client_facing", task: "T10", scenario: "hostile", slot: "client_facing:T10:hostile", expect: exp } }, "u1"],
    [{ type: "retire", id: "T10.cf.hostile", reason: "replaced by a better test" }, "u1"]);
  assert.equal(state(replaced).blueprints.find((x) => x.id === "T10.cf.hostile")!.status, "retired");
  // a retired test can be restored, and only a retired one
  const back = build(...[create, [{ type: "retire", id: "T04.happy", reason: "oops", waiver_approver: "Head of Licensing" }, "u1"], [{ type: "restore", id: "T04.happy", reason: "needed after all" }, "u1"]] as [Action, string][]);
  assert.equal(state(back).blueprints.find((x) => x.id === "T04.happy")!.status, "active");
  assert.match(refused(log, { type: "restore", id: "T04.happy", reason: "x" }), /Only a retired test/);
  assert.match(refused(retired, { type: "retire", id: "T04.happy", reason: "again" }), /Already retired/);
});

test("approval: a complete set is approved at a hash, and a set with a gap is refused with the gap named", () => {
  const log = build(create);
  const p = plan(state(log), required, { type: "approve", approver: OWNER }, "u2");
  assert.equal(p.ok, true);
  const approved = build(create, [{ type: "approve", approver: OWNER }, "u2"]);
  const s = state(approved);
  assert.equal(s.version, 1);
  assert.equal(s.approved!.hash, testSetHash(s.blueprints));
  assert.equal(s.approved!.approver, "Head of Licensing");
  assert.equal(inForce(s), true);
  assert.match(refused(approved, { type: "approve", approver: OWNER }, "u2"), /already approved and nothing has changed/);
  // the SOP changes: a new requirement appears, and the set can no longer be approved
  const changed = chunks.map((c) => (c.chunk_id.endsWith("#T04") ? { ...c, text: c.text.replace("more than 30 days", "more than 45 days") } : c));
  const newRequired = deriveTests({ sopId: SOP, profile: DV, chunks: changed, flags });
  const q = plan(state(log), newRequired, { type: "approve", approver: OWNER }, "u2");
  assert.equal(q.ok, false);
  assert.match((q as { error: string }).error, /not approvable yet.*T04: boundary at 45 days/);
});

test("separation of duties: whoever changed the set cannot approve it without a stated reason, which is logged", () => {
  const edited = build(create, [{ type: "edit", id: "T04.happy", changes: { title: "T04: edited" } }, "u1"]);
  assert.match(refused(edited, { type: "approve", approver: OWNER }, "u1"), /you cannot also approve it unless you give the reason/);
  assert.equal(refused(edited, { type: "approve", approver: OWNER }, "u2"), "", "someone else can");
  const self = build(...[create, [{ type: "edit", id: "T04.happy", changes: { title: "T04: edited" } }, "u1"], [{ type: "approve", approver: OWNER, self_approval_reason: "A one-person team; no one else holds the role" }, "u1"]] as [Action, string][]);
  assert.equal(state(self).approved!.self_approval_reason, "A one-person team; no one else holds the role");
  assert.equal(state(self).authors.length, 0, "approving resets the authors");
});

test("a change after approval makes the set a draft again, and re-approval gives a new version and hash", () => {
  const v1 = build(create, [{ type: "approve", approver: OWNER }, "u2"]);
  const h1 = state(v1).approved!.hash;
  const after = build(...[create, [{ type: "approve", approver: OWNER }, "u2"], [{ type: "edit", id: "T05.happy", changes: { title: "T05: edited" } }, "u1"]] as [Action, string][]);
  const s = state(after);
  assert.equal(s.draft, true);
  assert.equal(inForce(s), false);
  assert.equal(s.approved!.version, 1, "the earlier approval is still on record");
  const v2 = build(...[create, [{ type: "approve", approver: OWNER }, "u2"], [{ type: "edit", id: "T05.happy", changes: { title: "T05: edited" } }, "u1"], [{ type: "approve", approver: OWNER }, "u2"]] as [Action, string][]);
  assert.equal(state(v2).version, 2);
  assert.notEqual(state(v2).approved!.hash, h1);
});

test("an approval can be withdrawn with a reason, and the set can then be approved again", () => {
  const approved = build(create, [{ type: "approve", approver: OWNER }, "u2"]);
  assert.match(refused(build(create), { type: "withdraw", reason: "x" }), /no approval to withdraw/);
  assert.match(refused(approved, { type: "withdraw", reason: "" }), /needs a reason/);
  const withdrawn = build(...[create, [{ type: "approve", approver: OWNER }, "u2"], [{ type: "withdraw", reason: "The SOP is being rewritten" }, "u2"]] as [Action, string][]);
  assert.equal(state(withdrawn).approved, null);
  assert.equal(inForce(state(withdrawn)), false);
  assert.equal(refused(withdrawn, { type: "approve", approver: OWNER }, "u2"), "");
});

test("the log is a hash chain: it verifies, and any edited entry is detected", () => {
  const log = build(create, [{ type: "edit", id: "T04.happy", changes: { title: "T04: edited" } }, "u1"], [{ type: "approve", approver: OWNER }, "u2"]);
  assert.deepEqual(verifyTest(log), { ok: true });
  const forged = log.map((e, i) => (i === 1 ? { ...e, payload: { ...e.payload, changes: { title: "a different title" } } } : e));
  const v = verifyTest(forged);
  assert.equal(v.ok, false);
  assert.equal((v as { broken_seq: number }).broken_seq, 2);
  assert.deepEqual(replayTestSet(log), replayTestSet(log), "replay is deterministic");
});

test("review: before creation nothing is approvable; after it the set covers itself; a new requirement is a gap", () => {
  assert.equal(review(EMPTY_TESTSET, required).approvable, false);
  const r = review(state(build(create)), required);
  assert.deepEqual([r.gaps.length, r.approvable, r.inForce, r.covered === r.total], [0, true, false, true]);
  const withGap = review(state(build(create)), [...required, { ...required[0], id: "extra", slot: "boundary:T04:99days" }]);
  assert.equal(withGap.approvable, false);
  assert.equal(withGap.gaps[0].slot, "boundary:T04:99days");
});
