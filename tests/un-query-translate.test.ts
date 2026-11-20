import assert from "node:assert/strict";
import test from "node:test";
import { hasArabic, translateQuery } from "../src/lib/un/query-translate.ts";
import { evaluate } from "../scripts/eval_retrieval.ts";

test("Arabic queries are translated, cached, and fall back to the original on failure", async () => {
  assert.ok(hasArabic("ما هو"));
  assert.deepEqual(await translateQuery("human oversight", async () => { throw new Error("must not be called"); }), { query: "human oversight" });
  let calls = 0;
  const ok = async () => { calls++; return " human oversight "; };
  assert.deepEqual(await translateQuery("الإشراف البشري", ok), { query: "human oversight", from: "ar" });
  await translateQuery("الإشراف البشري", ok);
  assert.equal(calls, 1);
  assert.deepEqual(await translateQuery("تظلم", async () => { throw new Error("down"); }), { query: "تظلم" });
});

test("cached Arabic translations make BM25 recall non-zero offline", () => {
  const r = evaluate({ lang: "ar", translated: true }).rows.find((x) => x.method === "bm25")!;
  assert.ok(r.recall5 >= 0.8);
  assert.equal(evaluate({ lang: "ar" }).rows.find((x) => x.method === "bm25")!.recall5, 0);
});
