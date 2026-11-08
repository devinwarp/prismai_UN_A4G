import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { capPerSource, searchChunks, type Chunk, type Hit, type SearchOpts } from "./kb.ts";

// Hybrid retrieval (C1-6): BM25 plus cosine similarity over chunk vectors,
// fused with reciprocal rank fusion. Vectors are built offline by
// `python kb/build.py --embed` (ITU's embed_texts, Ollama nomic-embed-text, 768
// dims) and committed as kb/vectors.json; about a few hundred chunks fit in
// memory, so there is no database. The query is embedded at runtime with
// transformers.js (nomic-ai/nomic-embed-text-v1.5, prefix "search_query: ").
// If vectors or the embedder are unavailable, search is BM25 alone and says so.
//
// Agent retrieval inside scenario runs stays BM25: it is deterministic and
// needs no model, so a run reproduces. Hybrid serves the KB query endpoint.

export interface VectorFile {
  model: string;
  dim: number;
  ids: string[];
  vectors: number[][];
}

export const cosine = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/** Reciprocal rank fusion: score(d) = sum over rankings of weight / (k + rank(d)), rank from 1 (weight 1 by default). */
export function rrf(rankings: string[][], k = 60, weights: number[] = []): Map<string, number> {
  const score = new Map<string, number>();
  rankings.forEach((r, j) => r.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + (weights[j] ?? 1) / (k + i + 1))));
  return score;
}

/** Chunk ids ordered by cosine similarity to the query vector (best first). */
export function vectorRanking(chunks: Chunk[], vectors: VectorFile, query: number[], limit = 50): { id: string; sim: number }[] {
  const at = new Map(vectors.ids.map((id, i) => [id, i]));
  return chunks
    .flatMap((c) => { const i = at.get(c.chunk_id); return i === undefined ? [] : [{ id: c.chunk_id, sim: cosine(vectors.vectors[i], query) }]; })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, limit);
}

export type Mode = "hybrid" | "bm25";
export interface HybridResult {
  hits: Hit[];
  /** "hybrid" only when a query vector was used; otherwise the BM25 fallback. */
  mode: Mode;
}

const isUae = (c: Chunk) => c.jurisdiction === "UAE-federal" || c.jurisdiction === "Dubai";

/** BM25 fused with vector similarity. With no query vector, no vectors, or a
 * dimension mismatch it returns the plain BM25 result (mode "bm25"). */
export function hybridSearch(chunks: Chunk[], vectors: VectorFile | null, queryVec: number[] | null, query: string, opts: SearchOpts = {}): HybridResult {
  const k = opts.k ?? 5;
  const usable = vectors && queryVec && queryVec.length === vectors.dim;
  if (!usable) return { hits: searchChunks(chunks, query, opts), mode: "bm25" };
  const pool = Math.max(50, k * 10);
  const lex = searchChunks(chunks, query, { k: pool, stem: opts.stem });
  const vec = vectorRanking(chunks, vectors, queryVec, pool);
  const fused = rrf([lex.map((h) => h.chunk.chunk_id), vec.map((v) => v.id)], 60, [opts.lexicalWeight ?? 1, 1]);
  const byId = new Map(chunks.map((c) => [c.chunk_id, c]));
  let ranked: Hit[] = [...fused].sort((a, b) => b[1] - a[1]).map(([id, score]) => ({ chunk: byId.get(id)!, score }));
  if (opts.mix) {
    const uae = ranked.filter((h) => isUae(h.chunk));
    const world = ranked.filter((h) => !isUae(h.chunk));
    ranked = [];
    for (let i = 0; ranked.length < k && (i < uae.length || i < world.length); i++) {
      if (uae[i]) ranked.push(uae[i]);
      if (ranked.length < k && world[i]) ranked.push(world[i]);
    }
  }
  return { hits: opts.perSource && !opts.mix ? capPerSource(ranked, k, opts.perSource) : ranked.slice(0, k), mode: "hybrid" };
}

/** Parse and check a vector file against the chunks it must line up with. */
export function parseVectors(raw: unknown, chunks: Chunk[]): VectorFile | null {
  const v = raw as Partial<VectorFile> | null;
  if (!v || !Array.isArray(v.ids) || !Array.isArray(v.vectors) || v.ids.length !== v.vectors.length || typeof v.dim !== "number") return null;
  if (v.vectors.some((x) => !Array.isArray(x) || x.length !== v.dim)) return null;
  const have = new Set(chunks.map((c) => c.chunk_id));
  // every chunk must have a vector, or the fusion would silently favour the embedded ones
  const got = new Set(v.ids);
  if (chunks.some((c) => !got.has(c.chunk_id)) || v.ids.some((id) => !have.has(id))) return null;
  return v as VectorFile;
}

let vcache: VectorFile | null | undefined;
export function loadVectors(chunks: Chunk[]): VectorFile | null {
  if (vcache !== undefined) return vcache;
  try {
    const f = path.join(process.cwd(), "kb", "vectors.json");
    vcache = existsSync(f) ? parseVectors(JSON.parse(readFileSync(f, "utf8")), chunks) : null;
  } catch {
    vcache = null;
  }
  return vcache;
}

type Embedder = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: ArrayLike<number> }>;
let embedder: Promise<Embedder | null> | undefined;

/** Embed a query with transformers.js, or null if vectors are switched off
 * (KB_VECTOR is not "on"), the package is not installed, or the model cannot load
 * (blocked download, cold start too slow). Never throws. */
export async function embedQuery(query: string): Promise<number[] | null> {
  if (process.env.KB_VECTOR !== "on") return null; // BM25 is the default; vector search is opt-in
  embedder ??= (async () => {
    try {
      const pkg = "@huggingface/transformers"; // optional dependency, resolved at run time
      const tf = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pkg)) as {
        pipeline: (t: string, m: string) => Promise<Embedder>;
        env: { cacheDir: string; allowLocalModels: boolean };
      };
      tf.env.cacheDir = path.join(os.tmpdir(), "hf-cache"); // the function filesystem is read-only except tmp
      tf.env.allowLocalModels = false;
      return await tf.pipeline("feature-extraction", "nomic-ai/nomic-embed-text-v1.5");
    } catch {
      return null;
    }
  })();
  // The first call may have to download the model (cold start). Wait a bounded
  // time, then answer from BM25; the load keeps going so later calls can use it.
  const limit = Number(process.env.KB_VECTOR_TIMEOUT_MS) || 8000;
  const e = await Promise.race([embedder, new Promise<null>((r) => setTimeout(() => r(null), limit))]);
  if (!e) return null;
  try {
    const out = await e(`search_query: ${query}`, { pooling: "mean", normalize: true });
    return Array.from(out.data);
  } catch {
    return null;
  }
}
