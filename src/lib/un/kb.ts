import { readFileSync } from "node:fs";
import path from "node:path";

// Retrieval over kb/chunks.json, which kb/build.py produces with ITU's
// reference parse/chunk pipeline. Lexical (BM25) on purpose: no embedding
// service at runtime, and every hit is a citable chunk id.
// ponytail: BM25 only; swap to the Chroma vectors in kb/chroma if recall
// on paraphrased queries becomes the bottleneck.
export interface Chunk {
  chunk_id: string;
  source_id: string;
  text: string;
  sha256: string;
  title: string;
  url: string;
  issuer: string;
  jurisdiction: string;
  instrument_type: string;
  binding: boolean;
  date: string | null;
  topics: string[];
  matrix_quadrants: string[];
}

export interface Hit {
  chunk: Chunk;
  score: number;
}

const STOP = new Set(
  "the and for are was with that this from have has not but all any can will its they their which who what when where how may must shall should would could into than then there these those such been being also other more most some each both over under about between".split(
    " ",
  ),
);

const tokens = (s: string) =>
  (s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((t) => !STOP.has(t));

interface Index {
  tf: Map<string, number>[];
  len: number[];
  df: Map<string, number>;
  avg: number;
}
const indexes = new WeakMap<Chunk[], { plain?: Index; stem?: Index }>();

/** Light suffix stripping so "logged", "logging" and "logs" meet: plural s, -ies,
 * -ing, -ed, then an undoubled final consonant. Opt-in (SearchOpts.stem). */
export function stemWord(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith("ies")) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us")) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  if (s.length > 3 && /([^aeioulsz])\1$/.test(s)) s = s.slice(0, -1);
  return s;
}

const tokensStem = (s: string) => tokens(s).map(stemWord);

function indexOf(chunks: Chunk[], stem = false): Index {
  const slot = indexes.get(chunks) ?? {};
  indexes.set(chunks, slot);
  const have = stem ? slot.stem : slot.plain;
  if (have) return have;
  const tok = stem ? tokensStem : tokens;
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  for (const c of chunks) {
    const m = new Map<string, number>();
    const ts = tok(`${c.title} ${c.text}`);
    for (const t of ts) m.set(t, (m.get(t) ?? 0) + 1);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(m);
    len.push(ts.length);
  }
  const ix: Index = { tf, len, df, avg: len.reduce((a, b) => a + b, 0) / (len.length || 1) };
  if (stem) slot.stem = ix; else slot.plain = ix;
  return ix;
}

const isUae = (c: Chunk) => c.jurisdiction === "UAE-federal" || c.jurisdiction === "Dubai";

export interface SearchOpts {
  k?: number;
  /** Return the best k/2 UAE/Dubai chunks and the best k/2 from other
   * jurisdictions, interleaved: the UAE is the reference implementation, the
   * gap analysis is framed against global practice. */
  mix?: boolean;
  /** At most this many chunks from any one source in the returned list (extra
   * chunks from a crowded source are kept only to fill the list). Stops one
   * large document taking every slot. Default: no cap. */
  perSource?: number;
  /** Stem query and chunk terms (see stemWord). Off by default, so agent
   * retrieval inside runs is unchanged and reproducible. */
  stem?: boolean;
  /** Hybrid only: weight of the BM25 ranking in the fusion (vector weight is 1). */
  lexicalWeight?: number;
}

/** Cap how many of the best k hits may come from one source; skipped hits
 * backfill the list in rank order if fewer than k remain. */
export function capPerSource(hits: Hit[], k: number, cap: number): Hit[] {
  const out: Hit[] = [];
  const skipped: Hit[] = [];
  const count = new Map<string, number>();
  for (const h of hits) {
    const n = count.get(h.chunk.source_id) ?? 0;
    if (n < cap) { out.push(h); count.set(h.chunk.source_id, n + 1); } else skipped.push(h);
    if (out.length >= k) return out;
  }
  return [...out, ...skipped].slice(0, k);
}

export function searchChunks(chunks: Chunk[], query: string, opts: SearchOpts = {}): Hit[] {
  const k = opts.k ?? 5;
  const q = [...new Set((opts.stem ? tokensStem : tokens)(query))];
  if (!q.length || !chunks.length) return [];
  const ix = indexOf(chunks, opts.stem);
  const N = chunks.length;
  const hits: Hit[] = [];
  chunks.forEach((chunk, i) => {
    let score = 0;
    for (const t of q) {
      const f = ix.tf[i].get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - (ix.df.get(t) ?? 0) + 0.5) / ((ix.df.get(t) ?? 0) + 0.5));
      score += (idf * f * 2.5) / (f + 1.5 * (0.25 + 0.75 * (ix.len[i] / ix.avg)));
    }
    if (score > 0) hits.push({ chunk, score });
  });
  hits.sort((a, b) => b.score - a.score);
  if (!opts.mix) return opts.perSource ? capPerSource(hits, k, opts.perSource) : hits.slice(0, k);
  const uae = hits.filter((h) => isUae(h.chunk));
  const world = hits.filter((h) => !isUae(h.chunk));
  const out: Hit[] = [];
  for (let i = 0; out.length < k && (i < uae.length || i < world.length); i++) {
    if (uae[i]) out.push(uae[i]);
    if (out.length < k && world[i]) out.push(world[i]);
  }
  return out;
}

// Terms that appear in nearly every document here; they cannot show that a
// passage supports a claim, so they do not count toward overlap.
const GENERIC = new Set("artificial intelligence systems system government governments dubai uae emirates services service national federal policy framework agentic agents agent entities technology technologies development use used using".split(" "));

/** A passage (<= max chars) of `text` around the densest cluster of query
 * terms, and how many distinct non-generic query terms it contains. */
export function bestSentence(text: string, query: string, max = 240): { sentence: string; overlap: number } {
  const q = new Set(tokens(query).filter((t) => !GENERIC.has(t)));
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let best = sentences[0] ?? text;
  let overlap = -1;
  for (const s of sentences) {
    const n = new Set(tokens(s).filter((t) => q.has(t))).size;
    if (n > overlap) [best, overlap] = [s, n];
  }
  if (best.length > max) {
    const lower = best.toLowerCase();
    const at = [...q].map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((x, y) => x - y)[0] ?? 0;
    const start = Math.max(0, Math.min(at - 60, best.length - max));
    best = `${start > 0 ? "…" : ""}${best.slice(start, start + max).trim()}${start + max < best.length ? "…" : ""}`;
  }
  return { sentence: best, overlap: Math.max(0, overlap) };
}

/** A verbatim sentence (<= max chars) of the chunk that best matches the
 * query: a quote for a citation, never paraphrased. */
export function excerpt(text: string, query: string, max = 240): string {
  return bestSentence(text, query, max).sentence;
}

/** Citations that actually support the claim: chunks whose best sentence
 * shares at least `minOverlap` distinct terms with the query, best first.
 * Citing nothing beats citing a chunk that merely ranked first. */
export function supportingChunks(hits: Hit[], query: string, limit = 1, minOverlap = 3): Chunk[] {
  // The itu-* entries are secondary summaries from the reference repo (and
  // Y.3172 describes how to build, not what is required): primary instruments only.
  return hits
    .filter((h) => !h.chunk.source_id.startsWith("itu-"))
    .map((h) => ({ c: h.chunk, o: bestSentence(h.chunk.text, query).overlap }))
    .filter((x) => x.o >= minOverlap)
    .sort((a, b) => b.o - a.o)
    .slice(0, limit)
    .map((x) => x.c);
}

let cache: Chunk[] | null = null;
export function loadChunks(): Chunk[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(path.join(process.cwd(), "kb", "chunks.json"), "utf8")) as Chunk[];
  } catch {
    cache = [];
  }
  return cache;
}

export const hasChunk = (id: string) => loadChunks().some((c) => c.chunk_id === id);
