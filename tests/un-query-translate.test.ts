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
  assert.deepEqual(await translateQuery("مرحبا", async () => { throw new Error("down"); }), { query: "مرحبا" });
});

test("cached Arabic translations make BM25 recall non-zero offline", () => {
  const r = evaluate({ lang: "ar", translated: true }).rows.find((x) => x.method === "bm25")!;
  assert.ok(r.recall5 >= 0.8);
  assert.equal(evaluate({ lang: "ar" }).rows.find((x) => x.method === "bm25")!.recall5, 0);
});

test("with the translator down, the offline glossary still gives BM25 a usable Arabic query", async () => {
  const down = async () => { throw new Error("down"); };
  const r = await translateQuery("ما هي آليات الإشراف البشري؟", down);
  assert.equal(r.via, "glossary");
  assert.match(r.query, /human oversight/);
  const { glossQuery } = await import("../src/lib/un/query-gloss.ts");
  const { readFileSync } = await import("node:fs");
  const { searchChunks } = await import("../src/lib/un/kb.ts");
  const chunks = JSON.parse(readFileSync("kb/chunks.json", "utf8")) as { chunk_id: string; text: string }[];
  const norm = (s: string) => s.toLowerCase().split(/\s+/).join(" ");
  let hit = 0, n = 0;
  for (const f of ["questions", "heldout"]) for (const l of readFileSync(`kb/eval/${f}.jsonl`, "utf8").trim().split("\n")) {
    const q = JSON.parse(l) as { question: string; anchor: string; lang?: string };
    if (q.lang !== "ar") continue;
    const gold = chunks.filter((c) => norm(c.text).includes(norm(q.anchor))).map((c) => c.chunk_id);
    const g = glossQuery(q.question);
    const top = g ? searchChunks(chunks as never, g, { k: 5 }).map((h) => h.chunk.chunk_id) : [];
    n++; if (top.some((id) => gold.includes(id))) hit++;
  }
  assert.equal(n, 10);
  assert.ok(hit / n >= 0.8, `glossary recall@5 ${hit}/${n}`);
});
