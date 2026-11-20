// Embed every chunk of kb/chunks.json and every eval question with nomic-embed-text-v1.5,
// using the model's own task prefixes ("search_document: " for chunks, "search_query: " for
// queries), and write kb/vectors.json plus kb/eval/query_vectors.json.
//   node scripts/embed_kb.ts                 transformers.js (ONNX build of the same model)
//   LM_API_TOKEN=... node scripts/embed_kb.ts   LM Studio, OpenAI-compatible /v1/embeddings
// Env: LM_STUDIO_URL (default http://localhost:1234/v1), LM_EMBED_MODEL
// (default text-embedding-nomic-embed-text-v1.5). Which backend ran is recorded in the
// "meta" field of both files, and docs/RETRIEVAL_NOTE.md says so; nothing is hidden.
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DOC = "search_document: ";
const QUERY = "search_query: ";
const token = process.env.LM_API_TOKEN;
const base = process.env.LM_STUDIO_URL ?? "http://localhost:1234/v1";
const lmModel = process.env.LM_EMBED_MODEL ?? "text-embedding-nomic-embed-text-v1.5";

type Embed = (texts: string[]) => Promise<number[][]>;

async function backend(): Promise<{ embed: Embed; meta: Record<string, string> }> {
  if (token) {
    const embed: Embed = async (texts) => {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 16) {
        const r = await fetch(`${base}/embeddings`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ model: lmModel, input: texts.slice(i, i + 16) }),
        });
        if (!r.ok) throw new Error(`LM Studio ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const j = (await r.json()) as { data: { index: number; embedding: number[] }[] };
        out.push(...j.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
      }
      return out;
    };
    const norm = (v: number[]) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
    return { embed: async (t) => (await embed(t)).map(norm), meta: { backend: "lm-studio", server_model: lmModel } };
  }
  const tf = (await import("@huggingface/transformers")) as unknown as {
    pipeline: (t: string, m: string) => Promise<(x: string[], o: object) => Promise<{ tolist: () => number[][] }>>;
    env: { cacheDir: string };
  };
  tf.env.cacheDir = path.join(os.tmpdir(), "hf-cache");
  const pipe = await tf.pipeline("feature-extraction", "nomic-ai/nomic-embed-text-v1.5");
  const embed: Embed = async (texts) => {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 8) out.push(...(await pipe(texts.slice(i, i + 8), { pooling: "mean", normalize: true })).tolist());
    return out;
  };
  return { embed, meta: { backend: "transformers.js", server_model: "nomic-ai/nomic-embed-text-v1.5 (ONNX)" } };
}

const r5 = (v: number[]) => v.map((x) => Math.round(x * 1e5) / 1e5);
const lines = (f: string) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { id: string; question: string });

const { embed, meta } = await backend();
const date = new Date().toISOString().slice(0, 10);
const info = { ...meta, model: "nomic-embed-text-v1.5", embedded_on: date, doc_prefix: DOC, query_prefix: QUERY, pooling: "mean", normalized: true };

const chunks = JSON.parse(readFileSync("kb/chunks.json", "utf8")) as { chunk_id: string; text: string }[];
const vecs = await embed(chunks.map((c) => DOC + c.text));
writeFileSync("kb/vectors.json", JSON.stringify({ model: "nomic-embed-text-v1.5", dim: vecs[0].length, meta: info, ids: chunks.map((c) => c.chunk_id), vectors: vecs.map(r5) }));
console.log(`kb/vectors.json: ${vecs.length} x ${vecs[0].length} via ${meta.backend}`);

const qs = [...lines("kb/eval/questions.jsonl"), ...lines("kb/eval/heldout.jsonl")];
const qv = await embed(qs.map((q) => QUERY + q.question));
writeFileSync("kb/eval/query_vectors.json", JSON.stringify({ model: "nomic-embed-text-v1.5", meta: info, prefix: QUERY, vectors: Object.fromEntries(qs.map((q, i) => [q.id, r5(qv[i])])) }));
console.log(`kb/eval/query_vectors.json: ${qs.length} queries`);
