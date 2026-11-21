// Add vectors for the chunks of kb/chunks.json that kb/vectors.json does not have yet, and change nothing
// else: the existing vectors are kept as they are, so a source added with kb/add_excerpts.py does not
// re-embed (and slightly shift) the whole corpus. Same model and prefix as scripts/embed_kb.ts
// (nomic-embed-text-v1.5 via transformers.js, "search_document: "); the "meta" field says which backend ran.
//   node scripts/embed_new_chunks.ts
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tf = (await import("@huggingface/transformers")) as unknown as {
  pipeline: (t: string, m: string) => Promise<(x: string[], o: object) => Promise<{ tolist: () => number[][] }>>;
  env: { cacheDir: string };
};
tf.env.cacheDir = path.join(os.tmpdir(), "hf-cache");
const pipe = await tf.pipeline("feature-extraction", "nomic-ai/nomic-embed-text-v1.5");
const r5 = (v: number[]) => v.map((x) => Math.round(x * 1e5) / 1e5);

const chunks = JSON.parse(readFileSync("kb/chunks.json", "utf8")) as { chunk_id: string; text: string }[];
const vf = JSON.parse(readFileSync("kb/vectors.json", "utf8")) as { model: string; dim: number; meta?: Record<string, unknown>; ids: string[]; vectors: number[][] };
const have = new Set(vf.ids);
const add = chunks.filter((c) => !have.has(c.chunk_id));
for (let i = 0; i < add.length; i += 8) {
  const part = add.slice(i, i + 8);
  const out = (await pipe(part.map((c) => "search_document: " + c.text), { pooling: "mean", normalize: true })).tolist();
  part.forEach((c, j) => { vf.ids.push(c.chunk_id); vf.vectors.push(r5(out[j])); });
}
vf.meta = { ...(vf.meta ?? {}), extended_on: new Date().toISOString().slice(0, 10), extended_chunks: add.length };
writeFileSync("kb/vectors.json", JSON.stringify(vf));
console.log(`kb/vectors.json: +${add.length} vectors (${vf.ids.length} total, dim ${vf.dim})`);
