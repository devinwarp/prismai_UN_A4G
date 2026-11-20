// One-off, needs network + OPENROUTER_API_KEY (env or .env.local via --env-file): translates the
// Arabic eval questions to English with the same function the API uses, embeds the English
// text with nomic ("search_query: "), and caches both so scoring runs offline:
//   kb/eval/ar-translations.json            { id: english }
//   kb/eval/query_vectors.json              adds "<id>:en" keys
//   node --env-file=.env.local scripts/translate_eval_ar.ts
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { translateQuery } from "../src/lib/un/query-translate.ts";

const qs = ["kb/eval/questions.jsonl", "kb/eval/heldout.jsonl"].flatMap((f) =>
  readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { id: string; question: string; lang?: string })).filter((q) => q.lang === "ar");

const tr: Record<string, string> = {};
for (const q of qs) {
  const r = await translateQuery(q.question);
  if (!r.from) throw new Error(`translation failed for ${q.id}`);
  tr[q.id] = r.query;
  console.log(q.id, r.query);
}
writeFileSync("kb/eval/ar-translations.json", JSON.stringify(tr, null, 2) + "\n");

const tf = (await import("@huggingface/transformers")) as unknown as {
  pipeline: (t: string, m: string) => Promise<(x: string[], o: object) => Promise<{ tolist: () => number[][] }>>;
  env: { cacheDir: string };
};
tf.env.cacheDir = path.join(os.tmpdir(), "hf-cache");
const pipe = await tf.pipeline("feature-extraction", "nomic-ai/nomic-embed-text-v1.5");
const ids = Object.keys(tr);
const vecs = (await pipe(ids.map((id) => "search_query: " + tr[id]), { pooling: "mean", normalize: true })).tolist();
const f = "kb/eval/query_vectors.json";
const j = JSON.parse(readFileSync(f, "utf8"));
ids.forEach((id, i) => { j.vectors[`${id}:en`] = vecs[i].map((x) => Math.round(x * 1e5) / 1e5); });
writeFileSync(f, JSON.stringify(j));
console.log("done", ids.length);
