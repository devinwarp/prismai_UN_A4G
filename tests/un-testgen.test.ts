import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import test from "node:test";
import { can, type RoleId } from "../src/lib/un/authz.ts";
import { DOCS, RECORDS, TODAY } from "../src/lib/un/fixtures-uc02.ts";
import { loadSop } from "../src/lib/un/sop-kb.ts";
import { deriveTests } from "../src/lib/un/test-derive.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { appendTest, plan, replayTestSet, verifyTest, type TestEntry } from "../src/lib/un/test-sets.ts";
import {
  appendGen, appendGenLogTo, blueprintOf, buildGeneratorPrompt, buildRepairPrompt, checkExpectation, coverageGaps, cooldownLeft, describeStoreError, generate, refusalFor, loadGenLogFrom, minCases, parseGenerated, replayGen, riskClass,
  TESTGEN_DEFAULT_MODEL, testgenModel, verifyGen, type Ctx, type GenScenario,
} from "../src/lib/un/testgen.ts";

process.env.OFFLINE_DB = ".data/test-testgen.json";
const { offlineClient, OFFLINE_ORG } = await import("../src/lib/supabase/offline.ts");
test.after(() => { if (existsSync(".data/test-testgen.json")) rmSync(".data/test-testgen.json"); });

const SOP = "SOP-LIC-014";
const FP = "Fee and Payment Officer";
const chunks = loadSop(SOP).chunks;
const chunkIds = new Set(chunks.map((c) => c.chunk_id));
const profile = profilesOf(SOP)!.find((p) => p.name === FP)!;

const scenario = (over: Partial<GenScenario> = {}): GenScenario => ({
  id: `${SOP}/${FP}/T12`, title: "T12. Send the fee notice", sop_id: SOP, profile: FP, task: "T12", skill_id: "sop-lic-014-fee-and-payment-officer",
  risk: { client_facing: true, affects_rights: false, irreversible: false },
  gates: [{ id: "ai_disclosure", label: "AI disclosure", testable: true }, { id: "fee_accuracy", label: "Fee accuracy", testable: true }, { id: "human_final_approval", label: "A person approves", testable: false }],
  ...over,
});
const ctx = (s = scenario(), over: Partial<Ctx> = {}): Ctx => ({
  scenario: s, chunkIds, profileTasks: profile.tasks.map((t) => t.id), model: "m/test", existingIds: new Set(),
  fixtures: { licences: Object.entries(RECORDS).map(([key, r]) => ({ key, activity_group: r.activity_group, expiry: r.expiry })), docs: Object.keys(DOCS), today: TODAY }, ...over,
});
const good = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: "late bakery notice", family: "happy_path", gates: ["fee_accuracy"],
  input: { agent: "fp", task: "T12", licence: "bakery", request: { declared: "5610" }, docs: ["bakery-d1", "bakery-d2", "bakery-d3", "bakery-d4"], prepare: ["T04", "T05", "T06", "T07", "T08", "T09"] },
  expect: { outcome: "produce", summary: "notice states 2,200", assertions: [{ path: "output.notice.amount", op: "eq", value: 2200 }] },
  citations: ["SOP-LIC-014#S6", "SOP-LIC-014#T12"], confidence: "high", rationale: "Food and hospitality 2,000 plus 10% late fee.", ...over,
});
const reply = (...cases: unknown[]) => JSON.stringify({ cases });

test("the prompt carries the skill, the risk, the gates, the SOP lines and the output contract", () => {
  const s = scenario();
  const p = buildGeneratorPrompt(s, "SKILL-TEXT-MARKER", s.risk, s.gates, [{ chunk_id: "SOP-LIC-014#S6", text: "Fee table LINE-MARKER" }]);
  for (const m of ["SKILL-TEXT-MARKER", "client-facing", "fee_accuracy", "ai_disclosure", "[SOP-LIC-014#S6]", "LINE-MARKER", "output.notice", "sop-lic-014-fee-and-payment-officer", `at least ${minCases(s.risk)} cases`]) assert.ok((p.system + p.user).includes(m), m);
  assert.ok(p.user.includes("do not name it"), "a gate evidenced by a reviewer is not for a case");
});

test("a valid reply is parsed into cases carrying the scenario, skill, risk and model", () => {
  const g = parseGenerated(reply(good("fee-late"), good("fee-ontime", { gates: ["ai_disclosure"] })), ctx());
  assert.equal(g.cases.length, 2);
  assert.deepEqual(g.rejected, []);
  const c = g.cases[0];
  assert.equal(c.id, "t12.fee-late");
  assert.equal(c.scenario_id, `${SOP}/${FP}/T12`);
  assert.equal(c.skill_id, "sop-lic-014-fee-and-payment-officer");
  assert.equal(c.model, "m/test");
  assert.equal(c.risk.client_facing, true);
});

test("each rejection rule drops the case and says why", () => {
  const why = (c: unknown, over: Partial<Ctx> = {}) => parseGenerated(reply(c), ctx(scenario(), over)).rejected[0]?.reason ?? "";
  assert.match(why(good("a-1", { citations: ["SOP-LIC-014#NOPE"] })), /not in the SOP knowledge base/);
  assert.match(why(good("a-2", { citations: [] })), /no citation/);
  assert.match(why(good("a-3", { citations: undefined })), /no citation/);
  assert.match(why(good("a-4", { gates: ["made_up_gate"] })), /does not apply/);
  assert.equal(why(good("a-5", { gates: ["human_final_approval"] })), "", "an applicable gate may be named even if a reviewer evidences it");
  assert.match(why(good("a-6", { input: { agent: "fp", task: "T04", licence: "bakery" } })), /not a task of this job profile/);
  assert.match(why(good("a-7", { input: { agent: "fp", task: "T12", licence: "nowhere" } })), /not a known fixture/);
  assert.match(why(good("a-8", { input: { agent: "fp", task: "T12", licence: "bakery", docs: ["no-such-doc"] } })), /does not exist/);
  assert.match(why(good("a-9", { input: { agent: "fp", task: "T12", licence: "bakery", request: { colour: "red" } } })), /does not take/);
  assert.match(why(good("a-10", { expect: { outcome: "produce", summary: "x", assertions: [] } })), /assertions/);
  assert.match(why(good("a-11", { expect: { outcome: "produce", summary: "x", assertions: [{ path: "output.total", op: "approx", value: 1 }] } })), /unknown path or operator/);
  assert.match(why(good("a-12", { expect: { outcome: "produce", summary: "x", assertions: [{ path: "output.total", op: "eq" }] } })), /wrong value/);
  assert.match(why(good("a-13", { confidence: "certain" })), /confidence/);
  assert.match(why("not an object"), /not an object/);
  assert.match(why(good("dup-1"), { existingIds: new Set(["t12.dup-1"]) }), /duplicate id/);
  const twice = parseGenerated(reply(good("same-id"), good("same-id")), ctx());
  assert.equal(twice.cases.length, 1);
  assert.match(twice.rejected[0].reason, /duplicate id/);
});

test("malformed output is dropped and reported, never guessed", () => {
  for (const bad of ["", "I cannot help", "{not json", JSON.stringify({ cases: "nope" }), JSON.stringify({ other: [] })]) {
    const g = parseGenerated(bad, ctx());
    assert.equal(g.cases.length, 0);
    assert.equal(g.rejected.length, 1);
    assert.equal(g.rejected[0].index, -1);
  }
  const mixed = parseGenerated(reply(good("ok-one"), { id: "broken" }), ctx());
  assert.equal(mixed.cases.length, 1);
  assert.equal(mixed.rejected.length, 1);
});

test("a scenario with no skill is refused: nothing is generated and the model is never called", async () => {
  const s = scenario({ skill_id: null });
  let called = 0;
  const g = await generate(async () => { called++; return reply(good("x-1")); }, s, "", [], ctx(s));
  assert.equal(called, 0);
  assert.equal(g.cases.length, 0);
  assert.match(g.refused ?? "", /linked to a skill/);
  assert.equal(parseGenerated(reply(good("x-1")), ctx(s)).cases.length, 0);
});

test("a failed model call reports one rejection and invents nothing", async () => {
  const g = await generate(async () => { throw new Error("503 upstream"); }, scenario(), "skill", [], ctx());
  assert.equal(g.cases.length, 0);
  assert.match(g.rejected[0].reason, /model call failed/);
});

test("every testable gate must be covered, or it is a coverage gap; a reviewer gate is not a gap", () => {
  const only = parseGenerated(reply(good("c-1"), good("c-2"), good("c-3"), good("c-4")), ctx());
  assert.deepEqual(only.gaps.map((g) => g.gate), ["ai_disclosure"]);
  const all = parseGenerated(reply(good("c-1"), good("c-2", { gates: ["ai_disclosure"] }), good("c-3"), good("c-4")), ctx());
  assert.deepEqual(all.gaps, []);
});

test("the number of cases scales with risk", () => {
  const routine = { client_facing: false, affects_rights: false, irreversible: false };
  assert.equal(minCases(routine), 2);
  assert.equal(minCases({ ...routine, client_facing: true }), 4);
  assert.equal(minCases({ ...routine, affects_rights: true }), 4);
  assert.equal(minCases({ ...routine, irreversible: true }), 3);
  assert.equal(minCases({ client_facing: true, affects_rights: true, irreversible: true }), 7);
  assert.equal(riskClass(routine), "routine");
  assert.match(riskClass({ ...routine, client_facing: true, affects_rights: true }), /client-facing \+ rights-affecting/);
  const g = coverageGaps(scenario(), parseGenerated(reply(good("c-1", { gates: ["ai_disclosure", "fee_accuracy"] })), ctx()).cases);
  assert.deepEqual(g.map((x) => x.kind), ["count"]);
  assert.match(g[0].message, /1 of the 4 cases/);
});

test("an expectation is checkable against an actual result", () => {
  const e = parseGenerated(reply(good("e-1")), ctx()).cases[0].expect;
  assert.deepEqual(checkExpectation(e, { ok: true, output: { notice: { amount: 2200 } } }), []);
  assert.match(checkExpectation(e, { ok: true, output: { notice: { amount: 2000 } } })[0], /output\.notice\.amount eq 2200: got 2000/);
  const refuse = { outcome: "refuse" as const, summary: "x", assertions: [{ path: "escalate", op: "contains" as const, value: "Supervisor" }] };
  assert.deepEqual(checkExpectation(refuse, { ok: false, output: {}, refused: "no", escalate: "Licensing Supervisor (T16)" }), []);
  assert.equal(checkExpectation(refuse, { ok: true, output: {} }).length, 2);
});

test("the generator's default model differs from the goal judge's and the agent's (source-text guard)", () => {
  const llm = readFileSync("src/lib/llm.ts", "utf8");
  const chat = llm.match(/OPENROUTER_MODEL \?\? "([^"]+)"/)![1]; // the goal judge's default (GOAL_JUDGE_MODEL || CHAT_MODEL) and the agent's (AGENT_LLM_MODEL || CHAT_MODEL)
  assert.match(readFileSync("src/app/api/admin/un/use-cases/[id]/pilot/goals/route.ts", "utf8"), /GOAL_JUDGE_MODEL \|\| CHAT_MODEL/);
  assert.match(readFileSync("src/lib/un/react-llm.ts", "utf8"), /AGENT_LLM_MODEL \|\| CHAT_MODEL/);
  assert.notEqual(TESTGEN_DEFAULT_MODEL, chat);
  assert.notEqual(TESTGEN_DEFAULT_MODEL.split("/")[0], chat.split("/")[0], "a different family, not just a different version");
  assert.equal(testgenModel({}), TESTGEN_DEFAULT_MODEL);
  assert.equal(testgenModel({ TESTGEN_MODEL: "x/y" }), "x/y");
  assert.doesNotMatch(readFileSync("src/lib/un/testgen-store.ts", "utf8"), /GOAL_JUDGE_MODEL|CHAT_MODEL/);
});

// ---- the log: offline store, hash chain with old and new entries -------------------------------------------

test("proposals are appended to the log, replayed, accepted through the test set, and the chains verify", async () => {
  const db = offlineClient();
  const UC = "00000000-0000-4000-8000-0000000000aa";
  const g = parseGenerated(reply(good("fee-late"), good("fee-ontime", { gates: ["ai_disclosure"] })), ctx());
  const e1 = appendGen(null, "generated", "shaibi@example.invalid", { scenario_id: "s", model: "m/test", prompt_hash: "h", cases: g.cases, rejected: g.rejected, gaps: g.gaps, refused: null }, "2026-11-21T10:00:00.000Z");
  assert.equal(await appendGenLogTo(db, OFFLINE_ORG, UC, FP, e1), null);
  let log = await loadGenLogFrom(db, OFFLINE_ORG, UC, FP);
  assert.equal(log.length, 1);
  assert.equal(verifyGen(log).ok, true);

  // an OLD test-set log (created) and then accepting a proposal through the existing 'add' path
  const required = deriveTests({ sopId: SOP, profile: FP, chunks, flags: Object.fromEntries(profilesOf(SOP)!.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }]))) });
  const tlog: TestEntry[] = [];
  const created = plan(replayTestSet(tlog), required, { type: "create", profile: FP, sop_id: SOP, required }, "system");
  assert.ok(created.ok);
  if (created.ok) tlog.push(appendTest(null, created.kind, "system", created.payload, "2026-11-21T09:00:00.000Z"));
  const before = replayGen(log, replayTestSet(tlog).blueprints);
  assert.deepEqual(before.proposals.map((p) => p.status), ["proposed", "proposed"]);

  const prop = before.proposals[0].case;
  const added = plan(replayTestSet(tlog), required, { type: "add", blueprint: blueprintOf(prop) }, "u-author");
  assert.ok(added.ok, added.ok ? "" : added.error);
  if (added.ok) tlog.push(appendTest(tlog[tlog.length - 1], added.kind, "shaibi@example.invalid", added.payload, "2026-11-21T10:05:00.000Z"));
  assert.equal(verifyTest(tlog).ok, true);
  const set = replayTestSet(tlog);
  const bp = set.blueprints.find((b) => b.slot === `gen:${prop.id}`)!;
  assert.equal(bp.task, null, "no task: the pilot must not bind it to the hand-written cases and inflate the sample");
  assert.deepEqual(bp.source, prop.citations);
  assert.equal(set.draft, true, "accepting makes the set a draft until it is approved again");
  assert.deepEqual(replayGen(log, set.blueprints).proposals.map((p) => p.status), ["accepted", "proposed"]);

  // reject the other; old entries still replay
  const e2 = appendGen(log[0], "rejected", "x", { case_id: before.proposals[1].case.id, reason: "wrong fee" }, "2026-11-21T10:06:00.000Z");
  assert.equal(await appendGenLogTo(db, OFFLINE_ORG, UC, FP, e2), null);
  log = await loadGenLogFrom(db, OFFLINE_ORG, UC, FP);
  assert.equal(verifyGen(log).ok, true);
  assert.deepEqual(replayGen(log, set.blueprints).proposals.map((p) => p.status), ["accepted", "rejected"]);

  // tampering with a payload breaks the chain
  const forged = log.map((e, i) => (i === 0 ? { ...e, payload: { ...e.payload, model: "other" } } : e));
  assert.equal(verifyGen(forged).ok, false);
  // an unknown future kind ('ruled') does not disturb the replay
  assert.equal(replayGen([...log, appendGen(log[1], "ruled", "x", { case_id: "t12.fee-late" }, "2026-11-21T11:00:00.000Z")], set.blueprints).proposals.length, 2);
});

// ---- permissions ----------------------------------------------------------------------------------------

test("viewers get 403; a test author may propose but not accept; a process owner may do both", () => {
  const s = (role: RoleId) => ({ legacyRole: null, assignments: [{ role, scope: { kind: "use_case" as const, use_case_id: "uc1" } }] });
  const ctx1 = { use_case_id: "uc1" };
  assert.equal(can(s("viewer"), "scenario.propose", ctx1).ok, false);
  assert.equal(can(s("viewer"), "scenario.edit", ctx1).ok, false);
  assert.equal(can(s("operator"), "scenario.propose", ctx1).ok, false);
  assert.equal(can(s("test_author"), "scenario.propose", ctx1).ok, true);
  assert.equal(can(s("test_author"), "scenario.edit", ctx1).ok, false);
  assert.equal(can(s("process_owner"), "scenario.propose", ctx1).ok, true);
  assert.equal(can(s("process_owner"), "scenario.edit", ctx1).ok, true);
  assert.equal(can(s("process_owner"), "scenario.propose", { use_case_id: "other" }).ok, false);
});

test("the route checks permission before reading any state, and never weakens it", () => {
  const src = readFileSync("src/app/api/admin/un/use-cases/[id]/testgen/route.ts", "utf8");
  const post = src.slice(src.indexOf("export async function POST"));
  assert.match(post, /requirePermission\(\["scenario\.propose", "scenario\.edit", "goals\.approve"\]/);
  assert.ok(post.indexOf("who.decide(") < post.indexOf("loadUseCase"), "permission before state");
  assert.match(post, /act === "generate" \? "scenario\.propose" : act === "rule" \? "goals\.approve" : "scenario\.edit"/);
  assert.match(src, /requirePermission\("view"\)/);
});

test("a case must be runnable: fee tasks need a complete file, prepare is for verification tasks, text fields take text operators", () => {
  const why = (c: unknown) => parseGenerated(reply(c), ctx()).rejected[0]?.reason ?? "";
  const inp = (o: Record<string, unknown>) => ({ agent: "fp", task: "T12", licence: "bakery", ...o });
  assert.match(why(good("r-1", { input: inp({ prepare: ["T04"] }) })), /unless the file is complete/);
  assert.match(why(good("r-2", { input: inp({}) })), /unless the file is complete/);
  assert.match(why(good("r-3", { input: inp({ prepare: ["T11"] }) })), /only Document Verification tasks/);
  assert.equal(why(good("r-4", { input: inp({ seed: { status: "complete", late: true } }) })), "");
  assert.match(why(good("r-4b", { input: inp({ seed: { status: "complete", late: true, base_fee: 1 } }) })), /seed is malformed/);
  assert.match(why(good("r-5", { expect: { outcome: "escalate", summary: "x", assertions: [{ path: "escalate", op: "true" }] } })), /is text/);
  assert.equal(why(good("r-6", { expect: { outcome: "produce", summary: "x", assertions: [{ path: "output.received.0.amount", op: "eq", value: 2200 }] } })), "");
  assert.deepEqual(checkExpectation({ outcome: "produce", summary: "x", assertions: [{ path: "output.received.0.amount", op: "eq", value: 2200 }] }, { ok: true, output: { received: [{ amount: 2200 }] } }), []);
});

test("a case must run the task under test, not another task of the same job profile", () => {
  const g = parseGenerated(reply(good("other-task", { input: { agent: "fp", task: "T11", licence: "bakery", prepare: ["T04", "T05", "T06", "T07", "T08", "T09"] } })), ctx());
  assert.equal(g.cases.length, 0);
  assert.match(g.rejected[0].reason, /input\.task must be T12/);
});

test("a citation must be one of the SOP lines the model was shown, not any chunk of the SOP", () => {
  const shown = new Set(["SOP-LIC-014#T12"]);
  const other = [...chunkIds].find((c) => !shown.has(c))!;
  const g = parseGenerated(reply(good("cites-unseen", { citations: [other] }), good("cites-seen", { citations: ["SOP-LIC-014#T12"] })), ctx(scenario(), { chunkIds: shown }));
  assert.deepEqual(g.cases.map((c) => c.id), ["t12.cites-seen"]);
  assert.match(g.rejected[0].reason, /not in the SOP knowledge base/);
});

test("a job profile with no agent role is refused rather than generated for", () => {
  assert.equal(refusalFor(scenario()), null);
  assert.match(refusalFor(scenario({ profile: "Some Other Officer" }))!, /No agent role/);
  assert.match(refusalFor(scenario({ skill_id: null }))!, /not linked to a skill/);
});

test("a run cannot start inside the cooldown after the last logged run", () => {
  const at = "2026-11-23T10:00:00.000Z";
  const t = Date.parse(at);
  assert.equal(cooldownLeft([], t), 0);
  assert.equal(cooldownLeft([{ at }], t + 5_000, 15_000), 10_000);
  assert.equal(cooldownLeft([{ at }], t + 15_000, 15_000), 0);
  assert.equal(cooldownLeft([{ at: "not a date" }], t), 0);
});

test("an unapplied migration is reported as such, not as an empty log", async () => {
  assert.match(describeStoreError('relation "public.un_testgen_log" does not exist'), /Apply supabase\/un-testgen\.sql/);
  assert.equal(describeStoreError("connection reset"), "connection reset");
  const missing = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: { message: "Could not find the table 'public.un_testgen_log' in the schema cache" } }) }) }) }) }) };
  await assert.rejects(() => loadGenLogFrom(missing, "o", "u", "p"), /un-testgen\.sql/);
});

// ---- the repair pass ------------------------------------------------------------------------------------

const bad = (id: string, over: Record<string, unknown> = {}) => good(id, { title: `BAD-${id}`, citations: ["SOP-LIC-014#NOPE"], ...over });
const seq = (...replies: (string | Error)[]) => {
  const prompts: string[] = [];
  const chat = async (o: { system: string; user: string }) => { prompts.push(o.user); const r = replies[Math.min(prompts.length - 1, replies.length - 1)]; if (r instanceof Error) throw r; return r; };
  return { chat, prompts };
};
const gen = (chat: Parameters<typeof generate>[0], s = scenario()) => generate(chat, s, "skill", [], ctx(s));

test("repair: the prompt shows only the rejected cases with reasons; fixed ones are merged and marked; still-bad ones stay rejected", async () => {
  const first = reply(good("keep-1", { title: "KEEP-ONE", gates: ["ai_disclosure"] }), good("keep-2", { title: "KEEP-TWO" }), bad("fix-me"), bad("hopeless"));
  const second = reply(good("fix-me", { title: "FIXED" }), bad("hopeless", { title: "STILL-BAD" }));
  const { chat, prompts } = seq(first, second);
  const g = await gen(chat);
  assert.equal(prompts.length, 2);
  assert.equal(g.calls, 2);
  assert.ok(prompts[1].includes("BAD-fix-me") && prompts[1].includes("BAD-hopeless") && prompts[1].includes("not in the SOP knowledge base"));
  assert.ok(!prompts[1].includes("KEEP-ONE") && !prompts[1].includes("KEEP-TWO"), "accepted cases are not shown again");
  assert.deepEqual(g.cases.map((c) => [c.id, !!c.repaired]), [["t12.keep-1", false], ["t12.keep-2", false], ["t12.fix-me", true]]);
  assert.deepEqual(g.rejected.map((r) => [r.id, r.round]), [["hopeless", 2]]);
  assert.equal(g.repair?.rescued, 1);
  assert.equal(g.repair?.before, 2);
  assert.equal(g.repair?.outcome, "ok");
  assert.notEqual(g.repair?.prompt_hash, g.prompt_hash);
  assert.equal(g.repair?.prompt_hash.length, 16);
  assert.deepEqual(g.gaps.map((x) => x.kind), ["count"], "the gate gaps are closed, the count (4) is still short with 3 cases");
});

test("repair: the same validator applies, so a repaired case with an unknown citation stays rejected, and no loosening", async () => {
  const { chat } = seq(reply(bad("a-1")), reply(bad("a-1", { title: "again", citations: ["SOP-LIC-014#MADE-UP"] })));
  const g = await gen(chat);
  assert.equal(g.cases.length, 0);
  assert.match(g.rejected[0].reason, /not in the SOP knowledge base/);
  assert.equal(g.rejected[0].round, 2);
  assert.equal(g.repair?.rescued, 0);
});

test("repair: at most ONE repair call even when the second reply is also bad", async () => {
  const { chat, prompts } = seq(reply(bad("a-1")), reply(bad("a-1")), reply(good("a-1")));
  const g = await gen(chat);
  assert.equal(prompts.length, 2);
  assert.equal(g.calls, 2);
  assert.equal(g.cases.length, 0);
});

test("repair: a clean first round makes no second call", async () => {
  const { chat, prompts } = seq(reply(good("c-1", { gates: ["ai_disclosure", "fee_accuracy"] }), good("c-2"), good("c-3"), good("c-4")));
  const g = await gen(chat);
  assert.equal(prompts.length, 1);
  assert.equal(g.calls, 1);
  assert.equal(g.repair, null);
});

test("repair: gaps alone (no rejection) trigger the repair call, and its cases may close them", async () => {
  const { chat, prompts } = seq(reply(good("c-1")), reply(good("c-2", { gates: ["ai_disclosure"] }), good("c-3"), good("c-4")));
  const g = await gen(chat);
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1].includes('No case exercises the gate "ai_disclosure"'));
  assert.equal(g.cases.length, 4);
  assert.deepEqual(g.gaps, []);
  assert.equal(g.repair?.rescued, 3);
});

test("repair: a repair id that duplicates an accepted case is rejected", async () => {
  const { chat } = seq(reply(good("same-id"), bad("other")), reply(good("same-id")));
  const g = await gen(chat);
  assert.equal(g.cases.length, 1);
  assert.match(g.rejected.find((r) => r.round === 2)!.reason, /duplicate id/);
});

test("repair: a failed or unreadable repair call keeps the first-round result and says so", async () => {
  for (const [second, outcome] of [[new Error("503 upstream"), "failed"], ["not json at all", "malformed"]] as const) {
    const { chat, prompts } = seq(reply(good("keep-1"), bad("lost")), second);
    const g = await gen(chat);
    assert.equal(prompts.length, 2);
    assert.equal(g.calls, 2);
    assert.deepEqual(g.cases.map((c) => c.id), ["t12.keep-1"]);
    assert.deepEqual(g.rejected.map((r) => [r.id, r.round]), [["lost", undefined]], "the first-round rejection stands");
    assert.equal(g.repair?.outcome, outcome);
    assert.match(g.repair?.note ?? "", /first-round result is kept/);
  }
});

test("repair: a failed FIRST call is not repaired; a refused scenario makes no call", async () => {
  const { chat, prompts } = seq(new Error("boom"));
  const g = await gen(chat);
  assert.equal(prompts.length, 1);
  assert.equal(g.calls, 1);
  const none = await gen(chat, scenario({ skill_id: null }));
  assert.equal(none.calls, 0);
  assert.equal(prompts.length, 1);
});

test("repair: buildRepairPrompt is the first prompt plus the rejected cases, reasons and gaps", () => {
  const base = { system: "SYS", user: "BASE-USER [SOP-LIC-014#T12]" };
  const p = buildRepairPrompt(base, [{ raw: { id: "x-1" }, reason: "R-ONE" }], [{ kind: "count", message: "GAP-MSG" }]);
  assert.equal(p.system, "SYS");
  for (const m of ["BASE-USER [SOP-LIC-014#T12]", "R-ONE", '"x-1"', "GAP-MSG"]) assert.ok(p.user.includes(m), m);
});

test("repair: the log keeps calls, repair and repaired; old entries without them replay and verify", () => {
  const { chat } = seq(reply(good("k-1"), bad("fix")), reply(good("fix")));
  return gen(chat).then((g) => {
    const old = appendGen(null, "generated", "x", { scenario_id: "s", model: "m", prompt_hash: "h", cases: [good("o-1")], rejected: [], gaps: [], refused: null }, "2026-11-21T10:00:00.000Z");
    const next = appendGen(old, "generated", "x", { scenario_id: "s", model: "m", prompt_hash: g.prompt_hash, calls: g.calls, repair: g.repair, cases: g.cases, rejected: g.rejected, gaps: g.gaps, refused: null }, "2026-11-21T10:01:00.000Z");
    assert.equal(verifyGen([old, next]).ok, true);
    const st = replayGen([old, next], []);
    assert.equal(st.runs[0].calls, undefined);
    assert.equal(st.runs[0].repair, null);
    assert.equal(st.runs[1].calls, 2);
    assert.equal(st.runs[1].repair?.rescued, 1);
    assert.equal(st.proposals.find((p) => p.case.id === "t12.fix")?.case.repaired, true);
  });
});

test("repair: the route logs the calls and the repair and keeps the cooldown and the running lock", () => {
  const src = readFileSync("src/app/api/admin/un/use-cases/[id]/testgen/route.ts", "utf8");
  assert.match(src, /calls: g\.calls, repair: g\.repair/);
  assert.match(src, /cooldownLeft\(gstate\.runs/);
  assert.match(src, /running\.has\(key\)/);
  assert.equal((src.match(/await generate\(/g) ?? []).length, 1, "one generate() per run; the repair is inside it");
});

test("the generate route sets maxDuration, like the pilot routes (a repaired run makes two model calls)", () => {
  assert.match(readFileSync("src/app/api/admin/un/use-cases/[id]/testgen/route.ts", "utf8"), /export const maxDuration = 300;/);
});
