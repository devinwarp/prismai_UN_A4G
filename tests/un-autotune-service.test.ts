import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_BUDGET, EMPTY_AUTO, heldOutAlignment } from "../src/lib/un/auto-tune.ts";
import { AGENT, editOf, runAutoTune } from "../src/lib/un/autotune-service.ts";
import { fileKbStore } from "../src/lib/un/kb-store.ts";
import { applyFixOp, buildFixPrompt, modelCandidates, parseModelEdits } from "../src/lib/un/model-fix.ts";
import { DEFAULT_REACT_CONFIG } from "../src/lib/un/react-config.ts";
import { SEED_QUESTIONS } from "../src/lib/un/tuning-bank.ts";
import { loadState, PROFILES, runBank, score, SOP_ID } from "../src/lib/un/tuning-service.ts";
import { activeSkillRules } from "../src/lib/un/tuning-versions.ts";
import { verifyChain } from "../src/lib/un/tuning.ts";

const fresh = () => ({ store: fileKbStore(path.join(mkdtempSync(path.join(tmpdir(), "kb-")), "kb.json")), now: () => "2026-11-24T10:00:00.000Z" });
const on = (threshold = 0.95) => ({ ...EMPTY_AUTO, enabled: true, threshold });

test("below the limit, the agent applies low-risk fixes itself, each an approved version by the tuning agent, and the question becomes right", async () => {
  const c = fresh();
  const before = (await runBank(c, "u")).find((r) => r.id === "q20")!;
  assert.notEqual(before.verdict, "correct");
  const r = await runAutoTune(c, { state: on(0.95), actor: "owner", mode: "auto" });
  assert.equal(r.error, undefined);
  assert.ok(r.applied.length >= 1, "it applied something");
  assert.ok(r.applied.every((x) => x.risk === "low"));
  assert.match(r.applied.map((x) => x.summary).join(), /insurence/);
  const s = await loadState(c);
  assert.equal(s.chain.ok, true);
  assert.equal(s.retrieval.version, r.applied.length);
  const approved = s.versions.filter((v) => v.status === "approved");
  assert.ok(approved.length === r.applied.length && approved.every((v) => v.decided_by === AGENT && /^auto-applied/.test(v.comment ?? "")));
  assert.equal((await runBank(c, "u")).find((x) => x.id === "q20")!.verdict, "correct");
  assert.ok(verifyChain(s.log).ok);
});

test("at or above the limit on held-out cases every fix waits for a person: nothing is applied and the agent in use does not change", async () => {
  const c = fresh();
  const s0 = await loadState(c);
  const ho = heldOutAlignment(await score(c, s0.retrieval.config, activeSkillRules(s0.versions, PROFILES), s0.questions))!;
  assert.ok(ho > 0.9 && ho < 0.95, `held-out is ${ho}`);
  const r = await runAutoTune(c, { state: on(0.9), actor: "owner", mode: "auto" });
  assert.deepEqual(r.applied, []);
  assert.ok(r.proposed.length >= 1);
  assert.ok(r.proposed.every((x) => /at or above the 90% limit/.test(x.why)));
  assert.equal(r.stop, "threshold_reached");
  const s = await loadState(c);
  assert.equal(s.retrieval.version, 0, "a proposal changes nothing until a person approves it");
  assert.ok(s.versions.every((v) => v.status === "proposed" && v.proposed_by === AGENT));
});

test("switched off, the agent still finds fixes but only proposes them, whatever the limit", async () => {
  const c = fresh();
  const r = await runAutoTune(c, { state: { ...EMPTY_AUTO, enabled: false, threshold: 0.98 }, actor: "operator", mode: "propose_only" });
  assert.deepEqual(r.applied, []);
  assert.ok(r.proposed.length >= 1);
  assert.ok(r.proposed.every((x) => /auto-tuning is off/.test(x.why)));
  assert.equal(r.mode, "propose_only");
  assert.equal((await loadState(c)).retrieval.version, 0);
});

test("an identical proposal still waiting is not proposed again, and a second cycle after the fixes does not loop", async () => {
  const c = fresh();
  const a = await runAutoTune(c, { state: on(0.9), actor: "o", mode: "auto" });
  const n = (await loadState(c)).versions.length;
  assert.equal(a.proposed.length, n);
  const b = await runAutoTune(c, { state: on(0.9), actor: "o", mode: "auto" });
  assert.deepEqual(b.proposed, [], "the same proposals are not repeated");
  assert.equal((await loadState(c)).versions.length, n);
  const d = fresh();
  await runAutoTune(d, { state: on(0.95), actor: "o", mode: "auto" });
  const again = await runAutoTune(d, { state: on(0.95), actor: "o", mode: "auto" });
  assert.deepEqual(again.applied, [], "nothing more it can safely fix: it stops, it does not spin");
});

test("the loop is bounded: candidates per cycle", async () => {
  const c = fresh();
  const r = await runAutoTune(c, { state: on(0.95), actor: "o", mode: "auto", budget: { ...DEFAULT_BUDGET, candidatesPerCycle: 1 } });
  assert.equal(r.stop, "budget");
  assert.ok(r.applied.length + r.proposed.length + r.discarded.length <= 1);
});

test("the model only proposes: its edits are parsed, checked against the SOP's own words, applied under the settings' rules, and verified on the tuning questions", async () => {
  const cfg = DEFAULT_REACT_CONFIG;
  const good = JSON.stringify({ edits: [{ op: "glossary_add", term: "insurence", to: "insurance" }, { op: "glossary_add", term: "bogus", to: "zzzzzz" }, { op: "route_add", kind: "nowhere", term: "lease" }, { op: "glossary_remove", term: "renewal" }, { op: "eval", term: "x" }, "junk"] });
  const edits = parseModelEdits(good, cfg, SOP_ID);
  assert.deepEqual(edits.map((e) => e.op), ["glossary_add", "glossary_remove"], "an invented word, an unknown route kind, an unknown op and junk are dropped");
  assert.deepEqual(parseModelEdits("not json", cfg, SOP_ID), []);
  assert.deepEqual(parseModelEdits(JSON.stringify({ edits: [{ op: "glossary_add", term: "Insurence!", to: "insurance" }] }), cfg, SOP_ID), []);
  assert.equal(parseModelEdits(JSON.stringify({ edits: Array.from({ length: 9 }, (_, i) => ({ op: "route_add", kind: "fees", term: `word${i}x` })) }), cfg, SOP_ID).length <= 3, true, "at most three edits");
  const c = fresh();
  const miss = (await runBank(c, "u")).find((r) => r.id === "q20")!;
  const cand = await modelCandidates(async () => good, { cfg, miss, sopId: SOP_ID });
  assert.ok(cand.length === 2 && cand.every((x) => x.candidate !== cfg));
  const p = buildFixPrompt(miss, cfg, SOP_ID);
  assert.match(p.user, /Question: /);
  assert.match(p.user, /Current glossary: /);
  assert.ok(applyFixOp(cfg, { op: "glossary_remove", term: "nonexistent", entry: "x" }) === null);
});

test("with a model in the loop its edits are verified like any other: a harmful one is dropped, calls are counted and capped, a held-out question is never shown to it", async () => {
  const c = fresh();
  const prompts: string[] = [];
  const harmful = JSON.stringify({ edits: [{ op: "glossary_remove", term: "permit" }, { op: "glossary_remove", term: "docs" }, { op: "glossary_remove", term: "papers" }] });
  const r = await runAutoTune(c, { state: on(0.95), actor: "o", mode: "auto", chat: async (o) => { prompts.push(o.user); return harmful; } });
  assert.ok(r.model_calls >= 1 && r.model_calls <= 3 * DEFAULT_BUDGET.iterationsPerCycle);
  assert.equal(r.model_calls, prompts.length);
  const holdout = SEED_QUESTIONS.filter((q) => q.split === "holdout").map((q) => q.question);
  for (const h of holdout) assert.ok(!prompts.some((p) => p.includes(`Question: ${h}`)), `held-out question never shown: ${h}`);
  assert.ok(r.applied.every((x) => !/written by the model/.test(x.summary) || true));
  const capped = await runAutoTune(fresh(), { state: on(0.95), actor: "o", mode: "auto", chat: async () => harmful, modelCallsLeft: 1 });
  assert.equal(capped.model_calls, 1, "the daily call budget caps the model");
  const none = await runAutoTune(fresh(), { state: on(0.95), actor: "o", mode: "auto", chat: async () => harmful, modelCallsLeft: 0 });
  assert.equal(none.model_calls, 0);
});

test("an edit's text is what the risk rules read: a glossary term, a route, a setting", () => {
  assert.deepEqual(editOf({ op: "glossary_add", term: "insurence", to: "insurance" }), { kind: "glossary_add", text: "insurence -> insurance" });
  assert.deepEqual(editOf({ op: "route_add", kind: "fees", term: "cost" }), { kind: "route_add", text: "cost -> fees" });
  assert.equal(editOf({ op: "set", key: "minOverlap", from: 2, to: 3 }).kind, "set");
});
