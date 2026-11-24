import assert from "node:assert/strict";
import test from "node:test";
import { metered, parsePrices, recordModelCall, recordToolCalls } from "../src/lib/un/cost.ts";
import { buildLedger } from "../src/lib/un/cost-ledger.ts";

const prices = parsePrices({ models: { "m.a": { input: 1, output: 2 } }, tool_call: null });
const use = async (model: string, p: number, c: number, tools = 0) => (await metered(async () => { recordModelCall(model, p, c); recordToolCalls(tools); })).usage;

test("the ledger gathers what each stage recorded, skips records without usage and recomputed reports, and totals the rest", async () => {
  const gen = await use("m.a", 1_000_000, 0);
  const pilot = await use("m.a", 0, 1_000_000, 4);
  const j1 = await use("m.b", 100, 10), j2 = await use("m.b", 50, 5);
  const tune = await use("m.a", 10, 10);
  const win = await use("m.a", 0, 0, 7);
  const l = buildLedger({
    generation: [{ profile: "P", entries: [{ at: "2026-01-01T00:00:00Z", kind: "generated", payload: { usage: gen } }, { at: "2026-01-01T00:01:00Z", kind: "generated", payload: {} }] }],
    pilots: [
      { profile: "P", id: "p1", at: "2026-01-02T00:00:00Z", basis: null, plan: { agent: { cost: { usage: pilot } } } },
      { profile: "P", id: "p1b", at: "2026-01-03T00:00:00Z", basis: { pilot_id: "p1" }, plan: { agent: { cost: { usage: pilot } } } },
    ],
    reviews: [{ profile: "P", entries: [{ at: "2026-01-02T01:00:00Z", kind: "judged", payload: { judgments: [{ usage: j1 }, { usage: j2 }, {}] } }] }],
    tuning: [{ at: "2026-01-04T00:00:00Z", kind: "finished", payload: { record: { usage: tune } } }, { at: "2026-01-04T00:00:01Z", kind: "started", payload: {} }],
    watch: [{ at: "2026-01-05T00:00:00Z", kind: "window", payload: { window_no: 1, usage: win } }],
  }, prices);
  assert.equal(l.entries.length, 5);
  assert.deepEqual(l.entries.map((e) => e.stage), ["generation", "pilot", "judging", "tuning", "production"]);
  assert.equal(l.summary.by_stage.judging.calls, 2);
  assert.deepEqual(l.summary.unpriced, ["m.b"]); // the judge's model has no price: total is partial, not invented
  assert.equal(l.summary.usd, 3.00003); // 1 + 2 + (10*1+10*2)/1e6
  assert.equal(l.summary.usage.total.tool_calls, 11);
  assert.equal(l.summary.gross_calls, l.summary.usage.total.calls + 11);
});

test("an empty record set gives an empty ledger with no cost", () => {
  const l = buildLedger({ generation: [], pilots: [], reviews: [], tuning: [], watch: [] }, prices);
  assert.equal(l.entries.length, 0);
  assert.equal(l.summary.usd, null);
});

test("a meter records the time it was open, snapshots add their times, and the ledger totals it per stage", async () => {
  const slow = (await metered(async () => { await new Promise((r) => setTimeout(r, 30)); recordModelCall("m.a", 1, 1); })).usage;
  assert.ok((slow.elapsed_ms ?? 0) >= 25);
  const l = buildLedger({ generation: [], pilots: [], reviews: [], tuning: [{ at: "2026-01-01T00:00:00Z", kind: "finished", payload: { record: { usage: { ...slow, elapsed_ms: 1500 } } } }, { at: "2026-01-02T00:00:00Z", kind: "finished", payload: { record: { usage: { ...slow, elapsed_ms: 500 } } } }], watch: [] }, prices);
  assert.equal(l.summary.by_stage.tuning.elapsed_ms, 2000);
  assert.equal(l.summary.usage.elapsed_ms, 2000);
});
