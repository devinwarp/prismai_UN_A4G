import assert from "node:assert/strict";
import test from "node:test";
import { metered, parsePrices, recordModelCall, type UsageSnapshot } from "../src/lib/un/cost.ts";
import { buildLedger } from "../src/lib/un/cost-ledger.ts";
import { blueprintOf, replayGen } from "../src/lib/un/testgen.ts";

const none = { generation: [], pilots: [], reviews: [], tuning: [], watch: [] };

test("a metered step that fails still reports what it used, and rethrows the same error", async () => {
  const boom = new Error("boom");
  let seen: UsageSnapshot | undefined;
  await assert.rejects(metered(async () => { recordModelCall("m.a", 100, 20); throw boom; }, (u) => { seen = u; }), (e) => e === boom);
  assert.equal(seen?.total.calls, 1);
  assert.equal(seen?.total.prompt_tokens, 100);
});

test("the ledger counts the setup steps: SOP structuring and the targets agent's wording", async () => {
  const usage = (await metered(async () => { recordModelCall("m.a", 1_000_000, 0); })).usage;
  const l = buildLedger({
    ...none,
    structuring: [{ at: "2026-01-01T00:00:00Z", kind: "drafted", payload: { usage } }, { at: "2026-01-01T00:01:00Z", kind: "approved", payload: {} }],
    targets: [{ at: "2026-01-01T00:02:00Z", kind: "proposed", payload: { usage } }, { at: "2026-01-01T00:03:00Z", kind: "proposed", payload: {} }],
  }, parsePrices({ models: { "m.a": { input: 1, output: 2 } }, tool_call: null }));
  assert.deepEqual(l.entries.map((e) => [e.stage, e.label]), [["setup", "SOP structuring"], ["setup", "Process targets draft"]]);
  assert.equal(l.summary.by_stage.setup.calls, 2);
  assert.equal(l.summary.usd, 2);
});

test("a proposal keeps the time it was created after a person rejects it", () => {
  const e = (seq: number, kind: string, at: string, payload: object) => ({ seq, kind, at, actor: "a", payload, prev_hash: "", hash: "" }) as never;
  const s = replayGen([
    e(1, "generated", "2026-01-01T00:00:00Z", { cases: [{ id: "c1" }], scenario_id: "T01" }),
    e(2, "rejected", "2026-01-02T00:00:00Z", { case_id: "c1", reason: "duplicate" }),
  ], []);
  assert.equal(s.proposals[0].generated_at, "2026-01-01T00:00:00Z");
  assert.equal(s.proposals[0].at, "2026-01-02T00:00:00Z");
});

test("an accepted SOP happy-path case shows as in the test set, and its sibling of the same task and family does not", () => {
  const mk = (id: string) => ({ id, title: id, family: "happy_path", model: "m", input: { kind: "sop", task: "T03" }, expect: { summary: "s", assertions: [] }, gates: [], citations: [] }) as never;
  const log = [{ seq: 1, kind: "generated", at: "2026-11-28T00:00:00Z", actor: "a", payload: { cases: [mk("one"), mk("two")] }, prev_hash: "", hash: "" }] as never;
  const state = replayGen(log, [blueprintOf(mk("one")) as never]);
  assert.deepEqual(state.proposals.map((p) => p.status), ["accepted", "proposed"]);
});
