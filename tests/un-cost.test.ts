import assert from "node:assert/strict";
import test from "node:test";
import { costOf, emptySnapshot, entryOf, metered, parsePrices, recordModelCall, recordToolCalls, summarise, sumSnapshots, type PriceTable } from "../src/lib/un/cost.ts";

const prices: PriceTable = parsePrices({ models: { "m.cheap": { input: 1, output: 2 }, "m.unset": { input: null, output: null }, _note: { input: 9, output: 9 } }, tool_call: null });

test("a meter counts the model calls and tokens per model and the tool calls made inside it, and nothing outside", async () => {
  recordModelCall("m.cheap", 5, 5); // no meter open: ignored
  const { result, usage } = await metered(async () => {
    recordModelCall("m.cheap", 1000, 200);
    recordModelCall("m.cheap", 500, 100);
    recordModelCall("m.other", 10, 0);
    recordToolCalls(3);
    return "done";
  });
  assert.equal(result, "done");
  assert.deepEqual(usage.total, { calls: 3, prompt_tokens: 1510, completion_tokens: 300, tool_calls: 3 });
  assert.deepEqual(usage.by_model["m.cheap"], { calls: 2, prompt_tokens: 1500, completion_tokens: 300, tool_calls: 0, provider_usd: null });
  assert.equal(usage.by_model["m.other"].calls, 1);
});

test("meters nest: the outer one sees the calls of the inner ones, and concurrent work keeps its own counts", async () => {
  const inner: Awaited<ReturnType<typeof metered>>["usage"][] = [];
  const { usage: outer } = await metered(async () => {
    await Promise.all([1, 2, 3].map((n) => metered(async () => { await new Promise((r) => setTimeout(r, 5 * (4 - n))); recordModelCall("m.cheap", n * 100, n * 10); recordToolCalls(n); }).then((x) => inner.push(x.usage))));
  });
  assert.equal(outer.total.calls, 3);
  assert.equal(outer.total.prompt_tokens, 600);
  assert.equal(outer.total.tool_calls, 6);
  assert.deepEqual(inner.map((u) => u.total.prompt_tokens).sort((a, b) => a - b), [100, 200, 300], "each piece of work saw only its own call");
});

test("the price table keeps only real numbers; a field that is not a number is 'not set'", () => {
  assert.deepEqual(prices.models["m.cheap"], { input: 1, output: 2 });
  assert.deepEqual(prices.models["m.unset"], { input: null, output: null });
  assert.equal("_note" in prices.models, false);
  assert.deepEqual(parsePrices({ models: { a: { input: "3", output: -1 } }, tool_call: "x" }), { models: { a: { input: null, output: null } }, tool_call: null });
  assert.deepEqual(parsePrices(null), { models: {}, tool_call: null });
});

test("cost: tokens priced per million; an unpriced model is listed and makes the total partial; a provider-reported cost is used as it is; tool calls price only when set", () => {
  const u = (by: Record<string, [number, number, (number | null)?]>, tools = 0) => {
    const s = emptySnapshot();
    for (const [m, [p, c, usd]] of Object.entries(by)) { s.by_model[m] = { calls: 1, prompt_tokens: p, completion_tokens: c, tool_calls: 0, provider_usd: usd ?? null }; s.total.calls++; s.total.prompt_tokens += p; s.total.completion_tokens += c; }
    s.total.tool_calls = tools;
    return s;
  };
  const a = costOf(u({ "m.cheap": [1_000_000, 500_000] }), prices);
  assert.deepEqual([a.usd, a.partial, a.unpriced], [2, false, []]);
  const b = costOf(u({ "m.cheap": [1_000_000, 0], "m.unset": [999, 999] }), prices);
  assert.deepEqual([b.usd, b.partial, b.unpriced], [1, true, ["m.unset"]]);
  const c = costOf(u({ "m.unset": [10, 10] }), prices);
  assert.deepEqual([c.usd, c.partial], [null, true]);
  const d = costOf(u({ "m.unset": [10, 10, 0.5] }), prices);
  assert.deepEqual([d.usd, d.partial, d.priced], [0.5, false, ["m.unset"]]);
  assert.equal(costOf(u({ "m.cheap": [0, 0] }, 4), prices).usd, 0, "an unpriced tool call adds nothing but is counted");
  assert.equal(costOf(u({}, 4), prices).tool_calls, 4);
  assert.equal(costOf(u({ "m.cheap": [0, 0] }, 4), { ...prices, tool_call: 0.25 }).usd, 1);
  assert.equal(costOf(emptySnapshot(), prices).usd, null);
});

test("the ledger: the gross total counts model calls and tool calls, sums the priced entries, lists what is unpriced, and breaks down by stage", () => {
  const snap = (calls: number, tools: number, model: string, p = 1000, c = 1000) => { const s = emptySnapshot(); s.by_model[model] = { calls, prompt_tokens: p, completion_tokens: c, tool_calls: 0, provider_usd: null }; s.total = { calls, prompt_tokens: p, completion_tokens: c, tool_calls: tools }; return s; };
  const entries = [
    entryOf("generation", "g1", "T12 cases", "2026-11-24T10:00:00Z", snap(2, 0, "m.cheap", 1_000_000, 0), prices),
    entryOf("pilot", "p1", "pilot", "2026-11-24T11:00:00Z", snap(10, 40, "m.cheap", 0, 500_000), prices),
    entryOf("judging", "p1", "judge", "2026-11-24T12:00:00Z", snap(5, 0, "m.unset"), prices),
  ];
  const s = summarise(entries);
  assert.equal(s.gross_calls, 2 + 10 + 40 + 5, "model calls and tool calls together");
  assert.deepEqual([s.usage.total.calls, s.usage.total.tool_calls], [17, 40]);
  assert.equal(s.usd, 2, "1 for generation + 1 for the pilot; judging is unpriced");
  assert.deepEqual(s.unpriced, ["m.unset"]);
  assert.deepEqual([s.by_stage.generation.usd, s.by_stage.pilot.usd, s.by_stage.judging.usd], [1, 1, null]);
  assert.deepEqual([s.by_stage.pilot.calls, s.by_stage.pilot.tool_calls], [10, 40]);
  assert.equal(s.by_stage.tuning.entries, 0);
  const none = summarise([]);
  assert.deepEqual([none.usd, none.gross_calls, none.entries], [null, 0, 0]);
  assert.equal(sumSnapshots(entries.map((e) => e.usage)).total.calls, 17);
});
