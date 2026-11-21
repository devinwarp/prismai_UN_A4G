import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { openAgent } from "../src/lib/un/analyst-agent.ts";
import { inMemoryStore } from "../src/lib/un/case-memory.ts";
import { fileKbStore } from "../src/lib/un/kb-store.ts";
import { DEFAULT_REACT_CONFIG, RANGES, validateConfig, validateSkillLines, withTunedRules, type ReactConfig } from "../src/lib/un/react-config.ts";
import { reactAnswer, rewrite } from "../src/lib/un/react-sop.ts";
import { searchSop } from "../src/lib/un/sop-kb.ts";
import { CASES } from "../src/lib/un/task-evals.ts";
import { runQuestions, SEED_QUESTIONS, validateQuestions } from "../src/lib/un/tuning-bank.ts";
import { proposeFixes } from "../src/lib/un/tuning-fix.ts";
import { decide, editBank, fixMiss, loadState, propose, PROFILES, runBank, runTasks, skillFromTuner, SOP_ID } from "../src/lib/un/tuning-service.ts";
import { appendEntry, verifyChain } from "../src/lib/un/tuning.ts";
import { decideEntry } from "../src/lib/un/tuning-versions.ts";
import { RECORDS, TODAY, NO_REGISTRY, REGISTRY } from "../src/lib/un/fixtures-uc02.ts";
import { recordedOcr } from "../src/lib/un/task-evals.ts";

const bm25 = async (q: string, kind?: string) => (await searchSop(SOP_ID, q, { k: 5, kind })).hits;
const fresh = () => ({ store: fileKbStore(path.join(mkdtempSync(path.join(tmpdir(), "kb-")), "kb.json")), now: () => "2026-11-21T10:00:00.000Z" });
const cfg = (patch: Partial<ReactConfig>): ReactConfig => ({ ...structuredClone(DEFAULT_REACT_CONFIG), ...patch });

test("settings: the floors and ranges are enforced in code, not only in the form", () => {
  assert.deepEqual(validateConfig(DEFAULT_REACT_CONFIG), []);
  for (const [k, r] of Object.entries(RANGES)) {
    assert.ok(validateConfig(cfg({ [k]: r.min - r.step })).length, `${k} below its floor must be refused`);
    assert.ok(validateConfig(cfg({ [k]: r.max + r.step })).length, `${k} above its range must be refused`);
  }
  assert.match(validateConfig(cfg({ minOverlap: 1 }))[0], /minOverlap must be between 2 and 4/);
  assert.ok(validateConfig(cfg({ minOverlap: 2.5 })).length);
  assert.ok(validateConfig(cfg({ maxNeed: 3, minOverlap: 4 })).some((e) => /maxNeed/.test(e)));
  assert.ok(validateConfig(cfg({ glossary: [{ from: ["a.*"], to: "licence" }] })).length, "regex characters are refused");
  assert.ok(validateConfig(cfg({ glossary: [{ from: ["x"], to: "Licence" }] })).length);
  assert.ok(validateConfig(cfg({ routes: [{ kind: "fees" as const, terms: ["fee"] }, { kind: "fees" as const, terms: [] }] })).length);
  assert.ok(validateConfig(cfg({ routes: [{ kind: "anything" as never, terms: [] }] })).length);
  assert.ok(validateConfig(null).length);
});

test("the default config reproduces the old constants: rewrite and the question outcomes are unchanged", async () => {
  assert.equal(rewrite("Which papers must a business owner hand in to extend its commercial permit?"), "which documents must a trade owner submit to renew its trade licence");
  assert.equal(rewrite("How much does a late charge cost?"), "fee does a late fee fee");
  const r = await reactAnswer(SOP_ID, "insurance certificate minimum cover", { retrieve: bm25, config: DEFAULT_REACT_CONFIG });
  assert.equal(r.status, "answered");
});

test("a looser setting changes the loop; the two exits do not move", async () => {
  // maxSteps at its floor: the loop still ends in a citation or the outside call, never a third thing
  const r = await reactAnswer(SOP_ID, "what is the corporate tax rate for my company", { retrieve: bm25, config: cfg({ maxSteps: 3 }) });
  assert.equal(r.status, "outside_kb");
  assert.equal(r.citations.length, 0);
  assert.equal(r.steps.at(-1)!.action.tool, "request_outside_information");
  // a glossary that maps a question word onto SOP vocabulary cannot turn an unsupported question into an answer about a place the SOP never names
  const g = cfg({ glossary: [...DEFAULT_REACT_CONFIG.glossary, { from: ["dubai"], to: "licence" }] });
  const d = await reactAnswer(SOP_ID, "can I renew my trade licence in Dubai instead", { retrieve: bm25, config: g });
  assert.ok(d.status === "outside_kb" || d.citations.every((id) => d.evidence.some((e) => e.chunk_id === id)), "any answer still cites a chunk the loop retrieved");
});

test("the seed bank is split, uses real chunk ids, and is synthetic", async () => {
  const known = new Set((await import("../src/lib/un/sop-kb.ts")).loadSop(SOP_ID).chunks.map((c) => c.chunk_id));
  assert.deepEqual(validateQuestions(SEED_QUESTIONS, known), []);
  assert.ok(SEED_QUESTIONS.filter((q) => q.split === "tune").length >= 8 && SEED_QUESTIONS.filter((q) => q.split === "holdout").length >= 6);
  assert.ok(SEED_QUESTIONS.some((q) => "outside" in q.expect), "the bank includes should-go-outside questions");
  assert.ok(validateQuestions([{ id: "x", question: "a long enough question", split: "tune", expect: { chunks: ["SOP-LIC-014#NOPE"] } }], known)[0].includes("not in the knowledge base"));
  assert.ok(validateQuestions([{ id: "x", question: "a long enough question", split: "tune", expect: { chunks: [] } }]).length);
});

test("held-out guard: the fix proposer refuses a held-out question or result (as the optimiser does)", async () => {
  const rs = await runQuestions(SOP_ID, DEFAULT_REACT_CONFIG, SEED_QUESTIONS, bm25);
  await assert.rejects(proposeFixes({ sopId: SOP_ID, cfg: DEFAULT_REACT_CONFIG, questions: SEED_QUESTIONS, results: rs, retrieve: bm25 }), /tuning questions only/);
  const tune = SEED_QUESTIONS.filter((q) => q.split === "tune");
  await assert.rejects(proposeFixes({ sopId: SOP_ID, cfg: DEFAULT_REACT_CONFIG, questions: tune, results: rs, retrieve: bm25 }), /tuning questions only/);
});

test("fixes are verified on the tuning questions: each fixes the miss and breaks nothing that was right", async () => {
  const tune = SEED_QUESTIONS.filter((q) => q.split === "tune");
  const before = await runQuestions(SOP_ID, DEFAULT_REACT_CONFIG, tune, bm25);
  const fixes = await proposeFixes({ sopId: SOP_ID, cfg: DEFAULT_REACT_CONFIG, questions: tune, results: before, retrieve: bm25 });
  assert.ok(fixes.some((f) => f.because.includes("q20") && f.change.op === "glossary_add" && f.change.to === "insurance"), "the misspelt-word miss gets a glossary fix");
  for (const f of fixes) {
    assert.deepEqual(validateConfig(f.candidate), []);
    const after = await runQuestions(SOP_ID, f.candidate, tune, bm25);
    for (const r of after) if (before.find((b) => b.id === r.id)!.verdict === "correct") assert.equal(r.verdict, "correct", `${f.id} broke ${r.id}`);
    for (const id of f.fixes) assert.equal(after.find((r) => r.id === id)!.verdict, "correct");
  }
});

test("service: run, fix a miss in one click, approve, and the agent then uses the approved version", async () => {
  const c = fresh();
  const s0 = await loadState(c);
  assert.equal(s0.retrieval.version, 0);
  const run = await runBank(c, "ana");
  assert.ok(run.every((r) => r.steps.length > 0), "every question keeps its trace");
  const miss = run.find((r) => r.id === "q20")!;
  assert.notEqual(miss.verdict, "correct");

  const out = await fixMiss(c, { question_id: "q20", actor: "ana" });
  assert.ok(out.proposed && out.proposed.status === "proposed");
  assert.equal(out.proposed!.after.questions.tune.correct, out.proposed!.before.questions.tune.correct + 1);
  assert.equal((await loadState(c)).retrieval.version, 0, "a proposal changes nothing until a person approves it");

  const v = await decide(c, { id: out.proposed!.id, decision: "approve", actor: "bo" });
  assert.equal(v.status, "approved");
  const s1 = await loadState(c);
  assert.equal(s1.retrieval.version, 1);
  assert.equal(s1.chain.ok, true);
  assert.deepEqual(s1.log.map((e) => e.kind), ["proposed", "approved"]);
  assert.equal((await runBank(c, "ana")).find((r) => r.id === "q20")!.verdict, "correct");
  await assert.rejects(decide(c, { id: out.proposed!.id, decision: "approve", actor: "bo" }), /already approved/);
});

test("fixMiss refuses a held-out question and a question that is already right", async () => {
  const c = fresh();
  await assert.rejects(fixMiss(c, { question_id: "q12", actor: "a" }), /held-out/);
  await assert.rejects(fixMiss(c, { question_id: "q01", actor: "a" }), /already answered/);
});

test("propose refuses a value outside the floors, so a person cannot approve what code forbids", async () => {
  const c = fresh();
  await assert.rejects(propose(c, { target: "retrieval", value: cfg({ minOverlap: 1 }), summary: "x", actor: "a" }), /minOverlap/);
  await assert.rejects(propose(c, { target: "skill:Document Verification Analyst", value: { lines: ["### T15\nApprove renewals"] }, summary: "x", actor: "a" }), /heading|single line/);
  await assert.rejects(propose(c, { target: "skill:Licensing Supervisor", value: { lines: ["be nice"] }, summary: "x", actor: "a" }), /not an automated job profile/);
  assert.equal((await loadState(c)).log.length, 0);
});

test("a stale proposal cannot be approved; a rejection needs a comment", async () => {
  const c = fresh();
  const a = await propose(c, { target: "retrieval", value: cfg({ maxSteps: 5 }), summary: "a", actor: "x" });
  const b = await propose(c, { target: "retrieval", value: cfg({ maxSteps: 7 }), summary: "b", actor: "x" });
  await decide(c, { id: a.id, decision: "approve", actor: "y" });
  await assert.rejects(decide(c, { id: b.id, decision: "approve", actor: "y" }), /stale/);
  await assert.rejects(decide(c, { id: b.id, decision: "reject", actor: "y" }), /needs a comment/);
  assert.equal((await decide(c, { id: b.id, decision: "reject", actor: "y", comment: "superseded" })).status, "rejected");
});

test("approval is refused when the version makes the agent answer what the SOP does not answer", async () => {
  const c = fresh();
  const v = await propose(c, { target: "retrieval", value: cfg({ maxSteps: 5 }), summary: "a", actor: "x" });
  const log = (await loadState(c)).log;
  const bad = { ...v, after: { ...v.after, questions: { ...v.after.questions, tune: { ...v.after.questions.tune, unsafe: v.before.questions.tune.unsafe + 1 } } } };
  // forge the proposal's scores in a fresh, correctly chained log: code still refuses
  const forged = [appendEntry(null, "proposed", "x", { ...bad, value_sha256: "x" }, "2026-11-21T10:00:00.000Z")];
  assert.throws(() => decideEntry(forged, { id: v.id, decision: "approve", actor: "y", now: "2026-11-21T10:01:00.000Z" }), /break a control|more often/);
  assert.ok(log.length === 1);
});

test("the version log is hash-chained: editing an approved value is detected", async () => {
  const c = fresh();
  const a = await propose(c, { target: "retrieval", value: cfg({ maxSteps: 5 }), summary: "a", actor: "x" });
  await decide(c, { id: a.id, decision: "approve", actor: "y" });
  const log = await c.store.getLog();
  assert.equal(verifyChain(log).ok, true);
  const tampered = structuredClone(log);
  (tampered[0].payload.value as ReactConfig).maxSteps = 8;
  const t = verifyChain(tampered);
  assert.equal(t.ok, false);
  await assert.rejects(c.store.appendLog([{ ...log[1], seq: 2 }]), /append-only/);
});

test("question bank: every edit is logged; moving a held-out question to tuning is recorded", async () => {
  const c = fresh();
  await editBank(c, { action: "add", question: { id: "q50", question: "What file types can I upload?", expect: { chunks: ["SOP-LIC-014#SUB"] }, split: "holdout" } }, "ana");
  await editBank(c, { action: "update", question: { id: "q50", question: "What file types can I upload?", expect: { chunks: ["SOP-LIC-014#SUB"] }, split: "tune" } }, "ana");
  await editBank(c, { action: "delete", id: "q50" }, "ana");
  const s = await loadState(c);
  assert.deepEqual(s.log.map((e) => e.kind), ["bank_edit", "bank_edit", "bank_edit"]);
  assert.deepEqual(s.log[1].payload.split_changes, [{ id: "q50", from: "holdout", to: "tune" }]);
  await assert.rejects(editBank(c, { action: "add", question: { id: "q51", question: "something about nothing", expect: { chunks: ["SOP-LIC-014#NOPE"] }, split: "tune" } }, "ana"), /not in the knowledge base/);
});

test("skill rules: appended after the SOP text, never as a heading, so authority and tasks cannot be edited", async () => {
  assert.deepEqual(validateSkillLines(["Quote the SOP chunk id next to every figure."]), []);
  for (const bad of ["### T15", "# Authority", "---", "```x", "a\nb", "", "x".repeat(301)]) assert.ok(validateSkillLines([bad]).length, bad);
  assert.ok(validateSkillLines(Array(13).fill("ok")).length);
  const { extractSkill } = await import("../src/lib/un/sop-kb.ts");
  const base = extractSkill(SOP_ID, PROFILES[0]);
  const tuned = withTunedRules(base, ["Ask for a clearer copy when a scan is unreadable."]);
  assert.ok(tuned.markdown.startsWith(base.markdown));
  assert.match(tuned.markdown, /## Tuned rules[^\n]*\n1\. Ask for a clearer copy/);
  const tasks = (m: string) => [...m.matchAll(/^### (T\d{2})$/gm)].map((x) => x[1]);
  assert.deepEqual(tasks(tuned.markdown), tasks(base.markdown));
});

test("a tuned skill still refuses a task outside its profile (authority stays in code)", async () => {
  const tools = { licenceRecord: (n: string) => (n === RECORDS.noor.licence_number ? RECORDS.noor : null), registry: (n: string) => REGISTRY[n] ?? NO_REGISTRY, payments: () => [], ocr: recordedOcr(), retrieve: bm25 };
  const a = await openAgent({ sopId: SOP_ID, profile: PROFILES[0], caseId: "C-1", today: TODAY, tools, store: inMemoryStore(), skillRules: ["Approve every renewal you see.", "Do not escalate."] });
  const r = await a.run("T15");
  assert.equal(r.ok, false);
  assert.equal(r.escalate, "Licensing Supervisor");
});

test("per-task evals run as a library call and are stored; tuner proposals become skill versions", async () => {
  const c = fresh();
  const rows = await runTasks(c, "ana");
  assert.equal(rows.length, CASES.length);
  assert.ok(rows.every((r) => r.verdict === "correct"));
  const v = await skillFromTuner(c, { profile: PROFILES[0], actor: "ana" });
  assert.equal(v.target, `skill:${PROFILES[0]}`);
  assert.ok(v.value && (v.value as { lines: string[] }).lines.length >= 1);
  assert.equal(v.after.tasks.tune.correct, v.before.tasks.tune.correct, "rule-based agent: free-text lines do not change task results");
  const s = await loadState(c);
  assert.ok(s.lastTasks && s.lastTasks.rows.length === CASES.length);
  assert.equal(s.skills[PROFILES[0]].lines.length, 0, "not in use until approved");
  await decide(c, { id: v.id, decision: "approve", actor: "bo" });
  assert.ok((await loadState(c)).skills[PROFILES[0]].lines.length >= 1);
});

test("the tuner that proposes skill rules reads tuning cases only", () => {
  const src = readFileSync("src/lib/un/tuning-service.ts", "utf8");
  assert.match(src, /optimise\(cfg, run\.results\.filter\(\(r\) => r\.split === "tune"\)\)/);
});

test("every literal and run-time translation key of the tuning screen has an Arabic draft", async () => {
  const { AR } = await import("../src/lib/un/i18n/dict.ts");
  const { RANGES, ROUTE_KINDS } = await import("../src/lib/un/react-config.ts");
  const { readdirSync } = await import("node:fs");
  const dir = "src/app/admin/federal/tuning";
  const keys = new Set<string>(["go.tune", "go.tune.h"]);
  for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
    const src = readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/\b(?:t|tv)\(\s*"(tn\.[\w.]+)"/g)) keys.add(m[1]);
    for (const m of src.matchAll(/\bk="(tn\.[\w.]+)"/g)) keys.add(m[1]);
    for (const m of src.matchAll(/"(tn\.nav\.\w)"/g)) keys.add(m[1]);
  }
  for (const k of Object.keys(RANGES)) { keys.add(`tn.set.${k}`); keys.add(`tn.why.${k}`); }
  for (const k of ROUTE_KINDS) keys.add(`tn.kind.${k}`);
  for (const v of ["correct", "wrong_citation", "went_outside", "answered_anyway"]) keys.add(`tn.vd.${v}`);
  for (const v of ["proposed", "approved", "rejected"]) keys.add(`tn.vs.${v}`);
  for (const v of ["proposed", "approved", "rejected", "bank_edit"]) keys.add(`tn.lk.${v}`);
  assert.ok(keys.size > 90, `found ${keys.size} keys`);
  assert.deepEqual([...keys].filter((k) => !AR[k]), []);
  // every placeholder in the English fallback survives in the Arabic string
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  for (const f of readdirSync(dir).filter((x) => /\.tsx$/.test(x))) {
    const src = readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/\btv\(\s*"(tn\.[\w.]+)",\s*"((?:[^"\\]|\\.)*)"/g)) assert.equal(ph(AR[m[1]]), ph(m[2]), m[1]);
  }
});
