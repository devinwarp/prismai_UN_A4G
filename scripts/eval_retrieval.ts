// Retrieval evaluation (C1-7): recall@5 and MRR for BM25, vector and hybrid over
// kb/eval/questions.jsonl (gold chunks = chunks containing a verbatim anchor).
//   node scripts/eval_retrieval.ts [--write]     --write refreshes kb/eval/RESULTS.md
// Query vectors are nomic-embed-text-v1.5 with the "search_query: " prefix, written by
// scripts/embed_kb.ts into kb/eval/query_vectors.json, so this runs offline. Chunk
// vectors use "search_document: ". See docs/RETRIEVAL_NOTE.md for which server made them.
// Questions have lang "en" (default) or "ar"; Arabic is scored as its own set.
import { readFileSync, writeFileSync } from "node:fs";
import type { Chunk } from "../src/lib/un/kb.ts";
import { searchChunks } from "../src/lib/un/kb.ts";
import { hybridSearch, parseVectors, vectorRanking } from "../src/lib/un/vector.ts";

interface Q { vid?: string; id: string; area: string; question: string; gold: string[]; lang?: string }
export interface Row { method: string; recall5: number; mrr: number }

export interface Opts { dir?: string; set?: "tune" | "heldout"; lang?: "en" | "ar"; perSource?: number; stem?: boolean; lexicalWeight?: number; skipExcerpts?: boolean; translated?: boolean }

const norm = (s: string) => s.toLowerCase().split(/\s+/).join(" ");

export function evaluate(o: Opts = {}): { rows: Row[]; n: number; chunks: number } {
  const dir = o.dir ?? "kb";
  const chunks = JSON.parse(readFileSync(`${dir}/chunks.json`, "utf8")) as Chunk[];
  const vectors = parseVectors(JSON.parse(readFileSync(`${dir}/vectors.json`, "utf8")), chunks);
  if (!vectors) throw new Error(`${dir}/vectors.json does not match ${dir}/chunks.json`);
  // Gold is recomputed from each question's verbatim anchor, so any chunking can be scored.
  const file = o.set === "heldout" ? "kb/eval/heldout.jsonl" : "kb/eval/questions.jsonl";
  const lang = o.lang ?? "en";
  const qs = readFileSync(file, "utf8").trim().split("\n").filter((l) => (JSON.parse(l).lang ?? "en") === lang).map((l) => {
    const q = JSON.parse(l) as Q & { anchor: string };
    // translated: score the cached LLM English translation (kb/eval/ar-translations.json) and its cached vector
    const en = o.translated ? (JSON.parse(readFileSync("kb/eval/ar-translations.json", "utf8")) as Record<string, string>)[q.id] : undefined;
    if (o.translated && !en) throw new Error(`no cached translation for ${q.id}`);
    return { ...q, ...(en ? { question: en, vid: `${q.id}:en` } : {}), gold: chunks.filter((c) => norm(c.text).includes(norm(q.anchor))).map((c) => c.chunk_id) };
  }).filter((q) => q.gold.length > 0 && !(o.skipExcerpts && q.gold.every((id) => id.includes("-excerpts#"))));
  const cap = { ...(o.perSource ? { perSource: o.perSource } : {}), ...(o.stem ? { stem: true } : {}), ...(o.lexicalWeight ? { lexicalWeight: o.lexicalWeight } : {}) };
  const qv = (JSON.parse(readFileSync("kb/eval/query_vectors.json", "utf8")) as { vectors: Record<string, number[]> }).vectors;
  const rankers: Record<string, (q: Q) => string[]> = {
    bm25: (q) => searchChunks(chunks, q.question, { k: 50, ...cap }).map((h) => h.chunk.chunk_id),
    vector: (q) => vectorRanking(chunks, vectors, qv[q.vid ?? q.id], 50).map((v) => v.id),
    hybrid: (q) => hybridSearch(chunks, vectors, qv[q.vid ?? q.id], q.question, { k: 50, ...cap }).hits.map((h) => h.chunk.chunk_id),
  };
  const rows = Object.entries(rankers).map(([method, rank]) => {
    let hit5 = 0, rr = 0;
    for (const q of qs) {
      const r = rank(q);
      const at = r.findIndex((id) => q.gold.includes(id));
      if (at >= 0 && at < 5) hit5++;
      if (at >= 0) rr += 1 / (at + 1);
    }
    return { method, recall5: hit5 / qs.length, mrr: rr / qs.length };
  });
  return { rows, n: qs.length, chunks: chunks.length };
}

export const table = (rows: Row[]) =>
  ["| Method | recall@5 | MRR |", "|---|---|---|", ...rows.map((r) => `| ${r.method} | ${r.recall5.toFixed(2)} | ${r.mrr.toFixed(3)} |`)].join("\n");

if (process.argv[1]?.endsWith("eval_retrieval.ts")) {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
  const base = { dir: arg("--dir"), perSource: arg("--cap") ? Number(arg("--cap")) : undefined, stem: process.argv.includes("--stem"), lexicalWeight: arg("--lex") ? Number(arg("--lex")) : undefined, skipExcerpts: process.argv.includes("--no-excerpts") };
  const sets = [["Tuning set, English", { set: "tune" }], ["Held-out set, English", { set: "heldout" }], ["Arabic questions, no translation, tuning", { set: "tune", lang: "ar" }], ["Arabic questions, no translation, held-out", { set: "heldout", lang: "ar" }], ["Arabic questions with LLM query translation, tuning", { set: "tune", lang: "ar", translated: true }], ["Arabic questions with LLM query translation, held-out", { set: "heldout", lang: "ar", translated: true }]] as const;
  const vf = JSON.parse(readFileSync(`${base.dir ?? "kb"}/vectors.json`, "utf8")) as { meta?: Record<string, string> };
  const m = vf.meta;
  let md = `# Retrieval evaluation\n\nGold = chunks containing a verbatim anchor phrase from the source (kb/eval/make_questions.py), chosen from the text, not from rankings. Generated by \`node scripts/eval_retrieval.ts --write\`. Vectors: ${m ? `nomic-embed-text-v1.5, embedded ${m.embedded_on} via ${m.backend} (${m.server_model}); documents prefixed "${m.doc_prefix}", queries "${m.query_prefix}"` : "metadata missing"}.\n`;
  for (const [name, o] of sets) {
    const { rows, n, chunks } = evaluate({ ...base, ...o });
    md += `\n## ${name}: ${n} questions, ${chunks} chunks\n\n${table(rows)}\n`;
  }
  console.log(md);
  if (process.argv.includes("--write")) writeFileSync("kb/eval/RESULTS.md", md);
}
