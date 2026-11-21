// Chunk an SOP and embed it for retrieval by an agent.
//   node scripts/build_sop_kb.ts data/sops/uc02-trade-licence-renewal-sop.md
//   node scripts/build_sop_kb.ts <sop.md> --no-embed      chunks only (no model download)
//   LM_API_TOKEN=... node scripts/build_sop_kb.ts <sop.md>   LM Studio instead of transformers.js
// Writes kb/sop/<SOP id>/chunks.json and vectors.json. Same model, prefixes and
// normalisation as scripts/embed_kb.ts (nomic-embed-text-v1.5, "search_document: ").
// Only the part of the SOP before its Annex is indexed (see src/lib/un/sop-kb.ts).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chunkSop, retrievablePart, sopMetaFrom, type SopVectorFile } from "../src/lib/un/sop-kb.ts";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) { console.error("usage: node scripts/build_sop_kb.ts <sop.md> [--no-embed]"); process.exit(1); }

const md = readFileSync(file, "utf8");
const meta = sopMetaFrom(md, file.replace(/\\/g, "/"));
const chunks = chunkSop(md, meta);
const ids = chunks.map((c) => c.chunk_id);
if (new Set(ids).size !== ids.length) throw new Error("duplicate chunk ids");

const dir = path.join("kb", "sop", meta.sopId);
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "chunks.json"), JSON.stringify(chunks, null, 1));
const bytes = (s: string) => Buffer.byteLength(s);
console.log(`${dir}/chunks.json: ${chunks.length} chunks, ${Math.max(...chunks.map((c) => bytes(c.text)))} bytes at most, annex excluded`);
if (args.includes("--no-embed")) process.exit(0);

const DOC = "search_document: ";
const token = process.env.LM_API_TOKEN;
const base = process.env.LM_STUDIO_URL ?? "http://localhost:1234/v1";
const lmModel = process.env.LM_EMBED_MODEL ?? "text-embedding-nomic-embed-text-v1.5";
type Embed = (texts: string[]) => Promise<number[][]>;

async function backend(): Promise<{ embed: Embed; meta: Record<string, string> }> {
  if (token) {
    const norm = (v: number[]) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
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
        out.push(...j.data.sort((a, b) => a.index - b.index).map((d) => norm(d.embedding)));
      }
      return out;
    };
    return { embed, meta: { backend: "lm-studio", server_model: lmModel } };
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

const { embed, meta: info } = await backend();
const vecs = await embed(chunks.map((c) => DOC + c.text));
const r5 = (v: number[]) => v.map((x) => Math.round(x * 1e5) / 1e5);
const out: SopVectorFile & { meta: Record<string, string> } = {
  model: "nomic-embed-text-v1.5",
  dim: vecs[0].length,
  ids,
  vectors: vecs.map(r5),
  source_sha256: createHash("sha256").update(retrievablePart(md)).digest("hex"),
  chunk_sha256: Object.fromEntries(chunks.map((c) => [c.chunk_id, c.chunk_sha256])),
  meta: { ...info, model: "nomic-embed-text-v1.5", embedded_on: new Date().toISOString().slice(0, 10), doc_prefix: DOC, query_prefix: "search_query: ", pooling: "mean", normalized: "true" },
};
writeFileSync(path.join(dir, "vectors.json"), JSON.stringify(out));
console.log(`${dir}/vectors.json: ${vecs.length} x ${vecs[0].length} via ${info.backend}`);
