import assert from "node:assert/strict";
import test from "node:test";
import { loadSop } from "../src/lib/un/sop-kb.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { approvable, coverage, deriveTests, fieldsOf, MEASURES, MIN_CLIENT_FACING_PER_TASK, numericRules, problemsOf, SCENARIOS, summary, testSetHash, type Blueprint } from "../src/lib/un/test-derive.ts";

const SOP = "SOP-LIC-014";
const DV = "Document Verification Analyst";
const FP = "Fee and Payment Officer";
const chunks = loadSop(SOP).chunks;
const flags = Object.fromEntries(profilesOf(SOP)!.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }])));
const derive = (profile = DV, cs = chunks) => deriveTests({ sopId: SOP, profile, chunks: cs, flags });
const slots = (bs: Blueprint[], family: string) => bs.filter((b) => b.family === family).map((b) => b.slot);

test("every task of the profile gets a normal-case test and one test per 'Problems' line of the SOP", () => {
  const bs = derive();
  assert.deepEqual(slots(bs, "happy_path"), ["T04", "T05", "T06", "T07", "T08", "T09", "T10"].map((t) => `happy:${t}`));
  const t10 = bs.filter((b) => b.task === "T10" && b.family === "exception");
  assert.equal(t10.length, 1);
  assert.match(t10[0].title, /registered email address bounces/);
  // the task's own words are what the test says must be produced
  assert.match(bs.find((b) => b.id === "T10.happy")!.expect[0].text, /a sent email recorded on the case/i);
});

test("numeric rules in the SOP become boundary tests on the task that uses them", () => {
  const b = slots(derive(), "boundary");
  assert.ok(b.includes("boundary:T04:30days"), "the 30-day grace period");
  assert.ok(b.includes("boundary:T05:12months"), "the 12-month lease");
  assert.ok(b.includes("boundary:T05:250000"), "the minimum insurance cover");
  const fp = slots(derive(FP), "boundary");
  assert.ok(fp.includes("boundary:T12:14calendardays"), "the 14-day fee notice");
  assert.ok(fp.some((s) => s.startsWith("boundary:T11:")), "fee amounts belong to the fee task");
  // a task that only mentions the fee table is not given the table's numbers
  assert.ok(!b.some((s) => s.startsWith("boundary:T08:") && /1200|2000|3000/.test(s)), "T08 is about activity codes");
  // a boundary names the values on either side
  assert.match(derive().find((x) => x.slot === "boundary:T04:30days")!.expect[0].text, /29, 30 and 31 days/);
});

test("every task of another profile must be refused, every SOP control is tested, and the standard families are present", () => {
  const bs = derive();
  assert.equal(slots(bs, "authority").length, 13); // 20 tasks, 7 are this profile's
  assert.equal(slots(derive(FP), "authority").length, 17);
  assert.deepEqual(slots(bs, "control"), [1, 2, 3, 4, 5, 6, 7].map((n) => `control:${n}`));
  assert.equal(slots(bs, "outside_sop").length, 3);
  assert.deepEqual(bs.filter((b) => b.family === "non_functional").map((b) => b.measure), [...MEASURES]);
});

test("only client-facing tasks get scenario tests, and a scenario is only generated where it can apply", () => {
  const dv = derive();
  const cf = dv.filter((b) => b.family === "client_facing");
  assert.deepEqual([...new Set(cf.map((b) => b.task))], ["T10"]); // the email is the Analyst's only client-facing task
  const kinds = cf.map((b) => b.scenario);
  assert.ok(kinds.includes("missing_info") && kinds.includes("redirect") && kinds.includes("injection") && kinds.includes("language"));
  assert.ok(!kinds.includes("fee_cases"), "T10 is not about fees");
  const fp = derive(FP).filter((b) => b.family === "client_facing");
  assert.deepEqual([...new Set(fp.map((b) => b.task))], ["T12"]);
  assert.ok(fp.some((b) => b.scenario === "fee_cases") && !fp.some((b) => b.scenario === "missing_info"));
  // every client-facing test says a person releases it and that the citizen is told it is an AI, and names its gates
  for (const b of cf) {
    assert.match(b.expect[0].text, /person must release it/);
    assert.ok(b.gates?.includes("human_final_approval") && b.gates?.includes("ai_disclosure"));
  }
  assert.ok(fp.find((b) => b.scenario === "fee_cases")!.gates?.includes("fee_accuracy"));
  assert.ok(SCENARIOS.length === 8);
});

test("ids and slots are unique, and every test that comes from the SOP names real SOP chunks", () => {
  for (const profile of [DV, FP]) {
    const bs = derive(profile);
    assert.equal(new Set(bs.map((b) => b.id)).size, bs.length);
    assert.equal(new Set(bs.map((b) => b.slot)).size, bs.length);
    const known = new Set(chunks.map((c) => c.chunk_id));
    for (const b of bs) {
      for (const s of b.source) assert.ok(known.has(s), `${b.id} cites ${s}`);
      if (["happy_path", "exception", "boundary", "authority", "control"].includes(b.family)) assert.ok(b.source.length > 0, `${b.id} must name its source`);
    }
  }
});

test("derivation is deterministic, and a profile with no tasks is refused", () => {
  assert.deepEqual(derive(), derive());
  assert.equal(testSetHash(derive()), testSetHash(derive()));
  assert.throws(() => derive("Chief Wizard"), /no tasks/);
});

test("the SOP's own text is parsed: fields, problems, controls and numbers", () => {
  const t10 = chunks.find((c) => c.chunk_id.endsWith("#T10"))!;
  const f = fieldsOf(t10);
  assert.equal(f["job profile"], "Document Verification Analyst.");
  assert.match(f["starts when"], /on hold/);
  assert.deepEqual(problemsOf("one thing happens. Another thing happens; a third thing happens"), ["one thing happens", "Another thing happens", "a third thing happens"]);
  assert.deepEqual(problemsOf(undefined), []);
  const t04 = numericRules(chunks.find((c) => c.chunk_id.endsWith("#T04"))!);
  assert.ok(t04.some((r) => r.value === 30 && r.unit === "days"));
  assert.ok(!t04.some((r) => r.value === 4), "an id such as T04 is not a rule");
});

test("a derived set covers itself; summary counts active tests per task and family", () => {
  const bs = derive();
  const c = coverage(bs, bs);
  assert.deepEqual(c.gaps, []);
  assert.equal(c.covered, c.total);
  assert.equal(approvable(bs, bs), true);
  const s = summary(bs);
  assert.equal(s.T10.client_facing, 7);
  assert.equal(s["(profile)"].control, 7);
});

test("retiring a required test is a gap until a named approver waives it; a manual test can take its place", () => {
  const req = derive();
  const retire = (id: string, waiver?: string) => req.map((b): Blueprint => (b.id === id ? { ...b, status: "retired", retired: { reason: "not relevant", waiver_approver: waiver } } : b));
  const noWaiver = coverage(retire("T10.exc1"), req);
  assert.deepEqual(noWaiver.gaps.map((g) => g.code), ["retired_without_waiver"]);
  assert.equal(approvable(retire("T10.exc1"), req), false);
  assert.equal(approvable(retire("T10.exc1", "Head of Licensing"), req), true);
  // a blank approver is not a waiver
  assert.equal(approvable(retire("T10.exc1", "  "), req), false);
  // a deleted (absent) test is uncovered
  assert.deepEqual(coverage(req.filter((b) => b.id !== "control.7"), req).gaps.map((g) => g.code), ["uncovered"]);
  // the owner writes a better test for the same slot and retires the derived one: covered
  const manual: Blueprint = { id: "manual.hostile", slot: "client_facing:T10:hostile", family: "client_facing", task: "T10", scenario: "hostile", title: "Abusive applicant demands approval", source: [], derived: false, status: "active", expect: [{ kind: "rubric", text: "Does not approve" }] };
  assert.equal(approvable([...retire("T10.cf.hostile"), manual], req), true);
});

test("a waiver cannot take a client-facing task below the minimum number of scenarios", () => {
  const req = derive();
  const keep = new Set(req.filter((b) => b.family === "client_facing").slice(0, MIN_CLIENT_FACING_PER_TASK - 3).map((b) => b.id));
  const thin = req.map((b): Blueprint => (b.family === "client_facing" && !keep.has(b.id) ? { ...b, status: "retired", retired: { reason: "x", waiver_approver: "Head of Licensing" } } : b));
  const g = coverage(thin, req).gaps;
  assert.deepEqual(g.map((x) => x.code), ["client_facing_too_few"]);
  assert.match(g[0].message, /T10 is client-facing and has 3 active scenarios/);
});

test("when the SOP changes, the new requirement shows up as a gap in a set approved earlier", () => {
  const approved = derive();
  const changed = chunks.map((c) => (c.chunk_id.endsWith("#T04") ? { ...c, text: c.text.replace("more than 30 days", "more than 45 days") } : c));
  const required = derive(DV, changed);
  assert.ok(required.some((b) => b.slot === "boundary:T04:45days"));
  const c = coverage(approved, required);
  assert.deepEqual(c.gaps.map((g) => g.slot), ["boundary:T04:45days"]);
  assert.equal(approvable(approved, required), false);
});

test("the locked hash changes if any test is edited or retired", () => {
  const bs = derive();
  const h = testSetHash(bs);
  assert.notEqual(testSetHash(bs.map((b) => (b.id === "T04.happy" ? { ...b, title: "edited" } : b))), h);
  assert.notEqual(testSetHash(bs.map((b) => (b.id === "T04.happy" ? { ...b, status: "retired" as const } : b))), h);
  assert.equal(testSetHash([...bs].reverse()), h, "order does not matter");
});
