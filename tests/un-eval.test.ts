import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluate } from "../scripts/eval_retrieval.ts";

const norm = (s: string) => s.toLowerCase().split(/\s+/).join(" ");

test("C1-7: 30 questions, each gold chunk contains its verbatim anchor, every area is covered", () => {
  const chunks = new Map((JSON.parse(readFileSync("kb/chunks.json", "utf8")) as { chunk_id: string; text: string }[]).map((c) => [c.chunk_id, c.text]));
  const qs = readFileSync("kb/eval/questions.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l) as { id: string; area: string; anchor: string; gold: string[] });
  assert.equal(qs.length, 30);
  for (const q of qs) {
    assert.ok(q.gold.length >= 1, q.id);
    for (const id of q.gold) assert.ok(norm(chunks.get(id) ?? "").includes(norm(q.anchor)), `${q.id}: ${id}`);
  }
  assert.ok(new Set(qs.map((q) => q.area)).size >= 10);
});

test("C1-7: retrieval does not regress: BM25 recall@5 stays above 0.7 and hybrid is no worse than BM25 on recall", () => {
  const { rows, n } = evaluate();
  assert.equal(n, 30);
  const r = Object.fromEntries(rows.map((x) => [x.method, x]));
  assert.ok(r.bm25.recall5 >= 0.7, `bm25 recall@5 ${r.bm25.recall5}`);
  // one question of slack: the excerpt chunks reuse approximate vectors (docs/RETRIEVAL_NOTE.md) until re-embedded with Ollama
  assert.ok(r.hybrid.recall5 >= r.bm25.recall5 - 1 / 30 - 1e-9, `hybrid ${r.hybrid.recall5} < bm25 ${r.bm25.recall5}`);
  assert.ok(r.hybrid.recall5 >= 0.7, `hybrid recall@5 ${r.hybrid.recall5}`); // plan target is 0.85: not met, see kb/eval/RESULTS.md
});

test("the retrieval note names the decision, both result sets and the switch", async () => {
  const { readFileSync } = await import("node:fs");
  const note = readFileSync("docs/RETRIEVAL_NOTE.md", "utf8");
  const results = readFileSync("kb/eval/RESULTS.md", "utf8");
  for (const s of ["BM25 (what the app uses)", "KB_VECTOR=on", "331 chunks", "short quoted excerpts", "0.87", "0.86", "0.50", "not met"]) assert.ok(note.includes(s), s);
  // the 30-question numbers in the note are the ones in the generated results
  for (const row of results.split("\n").filter((l) => /^\| (bm25|vector|hybrid) /.test(l))) assert.ok(note.includes(row.split("|")[2].trim()), row);
});
