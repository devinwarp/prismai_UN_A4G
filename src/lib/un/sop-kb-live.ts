import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ChunkRow, KbStore, SopRow } from "./kb-store.ts";
import { checkSopKb, writeSkill, type KbCheck, type SkillResult } from "./skill-extract.ts";
import { chunkSop, extractSkill, loadSop, primeSop, retrievablePart, vectorStatus, type SopChunk, type SopVectorFile } from "./sop-kb.ts";
import { embedDocumentsWithStatus, type EmbeddingFailure } from "./vector.ts";

// The SOP knowledge base built INSIDE the app, for an SOP a person uploaded. Until now only the command-line script
// scripts/build_sop_kb.ts built one (into kb/sop/<id>/ on disk), so an uploaded SOP could never reach the stage that needs a
// knowledge base and skills. Server-only. The store and the embedder are injected so this can be tested without either.
//
// The rule that an automated agent is refused an SOP without current vectors (sop-kb.ts requireVectorised) is NOT relaxed here: a
// build that cannot embed stores the chunks, says "built WITHOUT vectors" and the check stays not ok until it is built again.

export interface LiveBuildInput { sopId: string; title: string; version: number; body: string; useCaseExt: string; entity: string }
export interface LiveBuildResult {
  /** The chunks were stored. */
  stored: boolean;
  chunks: number;
  vectors: boolean;
  /** An automated agent may use it: stored, with vectors in step with the chunks. */
  ready: boolean;
  reason: string;
}
type Embed = (texts: string[]) => Promise<number[][] | null>;
const embeddingFailureText: Record<EmbeddingFailure, string> = {
  runtime: "The server could not load the embedding runtime. Check the deployed runtime and its native libraries.",
  model: "The embedding runtime started, but could not load the model. Check model download access and the server logs.",
  timeout: "Embedding took longer than the build budget. Try building the knowledge base again.",
  inference: "The embedding model loaded, but failed while processing the SOP passages.",
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sourcePathOf = (i: { sopId: string; version: number }) => `sop://${i.sopId}/v${i.version}`;
const omit = <T extends object>(o: T, ...ks: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !ks.includes(k)));

/** The chunks of an uploaded SOP: the same chunker as the script, with the entity as the jurisdiction and a citation url that names the stored version. */
export function liveChunks(i: LiveBuildInput): SopChunk[] {
  return chunkSop(i.body, { sopId: i.sopId, version: String(i.version), useCaseId: i.useCaseExt, entity: i.entity, jurisdiction: i.entity, sourcePath: sourcePathOf(i) });
}

const toRow = (c: SopChunk, embedding: number[] | null): ChunkRow => ({
  chunk_id: c.chunk_id, sop_id: c.source_id, text: c.text, sha256: c.chunk_sha256, topics: c.topics,
  meta: omit(c, "text", "topics", "chunk_id", "chunk_sha256"), embedding,
});
const fromRow = (r: ChunkRow): SopChunk => ({ ...(r.meta as object), chunk_id: r.chunk_id, text: r.text, topics: r.topics, chunk_sha256: r.sha256 }) as SopChunk;

function withVectors(chunks: SopChunk[], vecs: number[][] | null, sourceSha: string): { chunks: SopChunk[]; vectors: SopVectorFile | null } {
  if (!vecs || vecs.length !== chunks.length || !vecs.length) return { chunks, vectors: null };
  return {
    chunks,
    vectors: { model: "nomic-embed-text-v1.5", dim: vecs[0].length, ids: chunks.map((c) => c.chunk_id), vectors: vecs, source_sha256: sourceSha, chunk_sha256: Object.fromEntries(chunks.map((c) => [c.chunk_id, c.chunk_sha256])) },
  };
}

/** Chunk, embed and store the SOP, and put it in this process's cache. Never throws. */
export async function buildLiveSopKb(store: KbStore, i: LiveBuildInput, embed?: Embed): Promise<LiveBuildResult> {
  const none = (reason: string): LiveBuildResult => ({ stored: false, chunks: 0, vectors: false, ready: false, reason });
  try {
    const chunks = liveChunks(i);
    if (!chunks.length) return none("The SOP has no text before its Annex to build a knowledge base from.");
    if (new Set(chunks.map((c) => c.chunk_id)).size !== chunks.length) return none("The SOP produced duplicate passage ids; check its headings.");
    const texts = chunks.map((c) => c.text);
    const result = embed
      ? { value: await embed(texts).catch(() => null) }
      : await embedDocumentsWithStatus(texts, 120_000);
    const vecs = "value" in result ? result.value : null;
    const sourceSha = sha(retrievablePart(i.body));
    const built = withVectors(chunks, vecs, sourceSha);
    const sop: SopRow = { sop_id: i.sopId, title: i.title, version: String(i.version), issuer: i.entity, source_path: sourcePathOf(i), source_sha256: sourceSha, synthetic: true };
    await store.putSop(sop);
    await store.putChunks(i.sopId, chunks.map((c, k) => toRow(c, built.vectors ? vecs![k] : null)));
    primeSop(i.sopId, built);
    loadedAt.set(i.sopId, Date.now());
    return built.vectors
      ? { stored: true, chunks: chunks.length, vectors: true, ready: true, reason: "Built with vectors." }
      : { stored: true, chunks: chunks.length, vectors: false, ready: false, reason: `Built WITHOUT vectors. ${"failure" in result ? embeddingFailureText[result.failure] : "The embedder returned no complete set of vectors."}` };
  } catch (e) {
    return none(`The knowledge base could not be built: ${message(e)}`);
  }
}

/** A knowledge base read back from the store, or null when there is none (or it is a seeded one without full chunk metadata). */
export async function loadLiveSopKb(store: KbStore, sopId: string): Promise<{ sop: SopRow; chunks: SopChunk[]; vectors: SopVectorFile | null } | null> {
  const sop = await store.getSop(sopId);
  if (!sop) return null;
  const rows = await store.listChunks(sopId);
  if (!rows.length) return null;
  const chunks = rows.map(fromRow);
  // a store seeded from disk (seedStore) keeps only a title, profile and version per chunk: not enough to rebuild a chunk from
  if (chunks.some((c) => !c.source_id)) return null;
  const vecs = rows.every((r) => r.embedding && r.embedding.length) ? rows.map((r) => r.embedding as number[]) : null;
  return { sop, ...withVectors(chunks, vecs, sop.source_sha256) };
}

const diskBuilt = (sopId: string) => existsSync(path.join(process.cwd(), "kb", "sop", sopId, "chunks.json"));
const loadedAt = new Map<string, number>();

/** Make sure loadSop(sopId) will find the SOP in this process. A knowledge base on disk (kb/sop/<id>/, the repo's SOPs) is used as it is. Otherwise it
 * is read from the store, at most once a minute per process, so a rebuild in another instance is picked up. */
export async function ensureLiveSop(store: KbStore, sopId: string, ttlMs = 60_000): Promise<"disk" | "store" | "none"> {
  if (diskBuilt(sopId)) return "disk";
  const t = loadedAt.get(sopId);
  if (t !== undefined && Date.now() - t < ttlMs) return loadSop(sopId).chunks.length ? "store" : "none";
  const live = await loadLiveSopKb(store, sopId).catch(() => null);
  loadedAt.set(sopId, Date.now());
  if (!live) return "none";
  primeSop(sopId, { chunks: live.chunks, vectors: live.vectors });
  return "store";
}

/** Is the SOP's knowledge base usable by an automated agent? `version` is the version of the SOP the use case is on. */
export async function checkLiveSopKb(store: KbStore, sopId: string, version?: number): Promise<KbCheck> {
  const how = await ensureLiveSop(store, sopId);
  if (how === "disk") return checkSopKb(sopId);
  if (how === "none") return { ok: false, reason: "The knowledge base for this SOP has not been built yet: build it from the SOP step." };
  const { chunks, vectors } = loadSop(sopId);
  const st = vectorStatus(chunks, vectors as SopVectorFile | null);
  if (!st.ok) return { ok: false, reason: st.reason.replace("run scripts/build_sop_kb.ts without --no-embed", "the embedding model was not available when it was built: build it again") };
  if (version !== undefined) {
    const sop = await store.getSop(sopId);
    if (sop && sop.version !== String(version)) return { ok: false, reason: `The knowledge base is for version ${sop.version} but the SOP is at version ${version}: build it again.` };
  }
  return { ok: true, reason: "vectors current" };
}

/** The skill for one job profile, after checking the knowledge base. For a stored knowledge base nothing is written to disk: the skill is
 * assembled from the chunks whenever it is needed, and only its hash is recorded with the tick. */
export async function writeLiveSkill(store: KbStore, sopId: string, profile: string, version?: number): Promise<SkillResult> {
  const how = await ensureLiveSop(store, sopId);
  if (how === "disk") return writeSkill(sopId, profile);
  const kb = await checkLiveSopKb(store, sopId, version);
  if (!kb.ok) return { ok: false, reason: kb.reason };
  try {
    const skill = extractSkill(sopId, profile);
    return { ok: true, path: skill.path, sha256: sha(skill.markdown), written: false };
  } catch (e) {
    return { ok: false, reason: message(e) };
  }
}
