import { readFileSync } from "node:fs";
import path from "node:path";
import { warmIndex, type Chunk } from "./kb.ts";
import type { PolicyRec, Timing } from "./country.ts";
import type { VectorFile } from "./vector.ts";

// Builds a knowledge-base scope on the spot from pre-fetched policy files: parse, chunk, index (BM25 in memory,
// vectors if the local embedder is available), then hand back everything the caller registers. No network is
// needed: the files are staged in the repo (kb/stage/<scope>/, with a manifest of url, sha256 and fetch date).
// Chunking mirrors ITU's chunker used by kb/build.py: about 256 words with 30 words of overlap.

export interface StagedFile { id: string; title: string; url: string; issuer: string; jurisdiction: string; instrument_type: string; binding: boolean; date: string; topics: string[]; source_sha256: string; text: string }

/** Reads kb/stage/<scope>/manifest.json and the files it lists. Throws if the stage is missing. */
export function readStaged(dir: string, root = process.cwd()): StagedFile[] {
  const base = path.join(root, dir);
  const man = JSON.parse(readFileSync(path.join(base, "manifest.json"), "utf8")) as { sources: (Omit<StagedFile, "text"> & { file: string })[] };
  return man.sources.map(({ file, ...m }) => ({ ...m, text: readFileSync(path.join(base, file), "utf8") }));
}

export function chunkWords(text: string, size = 256, overlap = 30): string[] {
  const w = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < w.length; i += size - overlap) {
    out.push(w.slice(i, i + size).join(" "));
    if (i + size >= w.length) break;
  }
  return out;
}

export type Embed = (texts: string[]) => Promise<number[][] | null>;
export interface BuildOut { chunks: Chunk[]; vectors: VectorFile | null; rec: Omit<PolicyRec, "country" | "ruleset" | "at" | "by"> }

/** The live build. `clock` is a millisecond clock and `onStage` receives each finished stage with its real count and time. */
export async function buildPolicy(files: StagedFile[], o: { embed: Embed | null; clock?: () => number; onStage?: (t: Timing) => void }): Promise<BuildOut> {
  const clock = o.clock ?? (() => performance.now());
  const timings: Timing[] = [];
  const mark = (stage: string, t0: number, detail: string) => { const t = { stage, ms: Math.round(clock() - t0), detail }; timings.push(t); o.onStage?.(t); };
  const T0 = clock();

  let t = clock();
  const words = files.map((f) => f.text.split(/\s+/).filter(Boolean).length);
  mark("parse", t, `${files.length} files, ${words.reduce((a, b) => a + b, 0)} words`);

  t = clock();
  const chunks: Chunk[] = files.flatMap((f) => chunkWords(f.text).map((text, i) => ({
    chunk_id: `${f.id}#${i}`, source_id: f.id, text, sha256: f.source_sha256, title: f.title, url: f.url, issuer: f.issuer,
    jurisdiction: f.jurisdiction, instrument_type: f.instrument_type, binding: f.binding, date: f.date, topics: f.topics, matrix_quadrants: [],
  })));
  mark("chunk", t, `${chunks.length} chunks of about 256 words`);

  t = clock();
  const ix = warmIndex(chunks);
  mark("index (BM25)", t, `${ix.docs} documents, ${ix.terms} terms, in memory`);

  t = clock();
  const vecs = o.embed ? await o.embed(chunks.map((c) => c.text)) : null;
  const vectors: VectorFile | null = vecs && vecs.length === chunks.length ? { model: "nomic-embed-text-v1.5", dim: vecs[0].length, ids: chunks.map((c) => c.chunk_id), vectors: vecs } : null;
  mark("vectors", t, vectors ? `${vectors.vectors.length} vectors of ${vectors.dim} dimensions (local nomic-embed-text-v1.5, no API key)` : "skipped: the local embedder is not available here; retrieval is BM25 only");

  return {
    chunks, vectors,
    rec: {
      sources: files.map((f, i) => ({ id: f.id, title: f.title, url: f.url, sha256: f.source_sha256, words: words[i], chunks: chunks.filter((c) => c.source_id === f.id).length })),
      chunks: chunks.length, vectors: vectors ? { have: vectors.ids.length, model: vectors.model } : null,
      vectors_note: vectors ? "built now" : "BM25 only: vectors need the local embedding model (about 130 MB, downloaded once, no API key); it was not available or too slow here",
      timings, total_ms: Math.round(clock() - T0),
    },
  };
}
