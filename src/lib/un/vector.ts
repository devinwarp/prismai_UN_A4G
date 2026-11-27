import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { capPerSource, searchChunks, type Chunk, type Hit, type SearchOpts } from "./kb.ts";

// Hybrid retrieval (C1-6): BM25 plus cosine similarity over chunk vectors,
// fused with reciprocal rank fusion. Vectors are built offline by
// `node scripts/embed_kb.ts` (nomic-embed-text-v1.5, 768 dims, "search_document: "
// prefix; metadata in kb/vectors.json "meta") and committed as kb/vectors.json; a few hundred chunks fit in
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

/** The shared embedder (transformers.js, nomic-embed-text-v1.5), or null if the package is missing, the model
 * cannot load (blocked download) or loading outlasts `limitMs`. The load keeps going so later calls can use it.
 * Runs locally: no API key. The first use downloads the model unless it is cached under the temp folder. */
async function getEmbedder(limitMs: number): Promise<Embedder | null> {
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
  return Promise.race([embedder, new Promise<null>((r) => setTimeout(() => r(null), limitMs))]);
}

/** Embed a query with transformers.js, or null if vectors are switched off
 * (KB_VECTOR is not "on"), the package is not installed, or the model cannot load
 * (blocked download, cold start too slow). Never throws. */
export async function embedQuery(query: string, opts: { force?: boolean } = {}): Promise<number[] | null> {
  // BM25 is the default for the regulatory search; vector search is opt-in there. An automated agent's retrieval is not optional (`force`): see searchSopRequired.
  if (!opts.force && process.env.KB_VECTOR !== "on") return null;
  // The first call may have to download the model (cold start). Wait a bounded
  // time, then answer from BM25; the load keeps going so later calls can use it.
  const e = await getEmbedder(Number(process.env.KB_VECTOR_TIMEOUT_MS) || (opts.force ? 30000 : 8000));
  if (!e) return null;
  try {
    const out = await e(`search_query: ${query}`, { pooling: "mean", normalize: true });
    return Array.from(out.data);
  } catch {
    return null;
  }
}

/** Embed documents with the same model ("search_document: " prefix), for a knowledge base built live
 * (country-build.ts). Independent of KB_VECTOR. Null if the embedder is unavailable or too slow; never throws. */
export async function embedDocuments(texts: string[], limitMs = 20000): Promise<number[][] | null> {
  const t0 = Date.now();
  const e = await getEmbedder(limitMs);
  if (!e) return null;
  try {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 8) {
      if (Date.now() - t0 > limitMs) return null;
      for (const t of texts.slice(i, i + 8)) out.push(Array.from((await e(`search_document: ${t}`, { pooling: "mean", normalize: true })).data).map((x) => Math.round(x * 1e5) / 1e5));
    }
    return out;
  } catch {
    return null;
  }
}
