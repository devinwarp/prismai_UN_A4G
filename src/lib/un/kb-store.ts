import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadSop } from "./sop-kb.ts";
import { SEED_QUESTIONS, type Question } from "./tuning-bank.ts";
import { GENESIS } from "./tuning.ts";
import type { TuningEntry } from "./tuning-versions.ts";

// Storage for the SOP knowledge base and its tuning: SOPs, chunks (with their embeddings), configs
// (the versions), questions, runs and the hash-chained version log. One interface, two implementations:
//   fileKbStore       the default; one JSON file, used offline and in the tests.
//   supabaseKbStore   kb-store-supabase.ts; written against supabase/un-sop-kb.sql and unit-tested only
//                     against a mocked client. That SQL has NOT been applied to any database.
// The outside-request queue is a separate table owned by another workstream, not part of this store.

export interface SopRow { sop_id: string; title: string; version: string; issuer: string; source_path: string; source_sha256: string; synthetic: true }
export interface ChunkRow { chunk_id: string; sop_id: string; text: string; sha256: string; topics: string[]; meta: Record<string, unknown>; embedding: number[] | null }
export interface ConfigRow { id: string; target: string; version: number; status: "proposed" | "approved" | "rejected"; value: unknown; summary: string; created_by: string; created_at: string; decided_by: string | null; decided_at: string | null }
export interface RunRow { id: string; sop_id: string; kind: "questions" | "tasks"; config_version: number; at: string; actor: string; summary: unknown; results: unknown }

export interface KbStore {
  putSop(s: SopRow): Promise<void>;
  getSop(sopId: string): Promise<SopRow | null>;
  /** Replaces every chunk of the SOP (a rebuilt knowledge base). */
  putChunks(sopId: string, rows: ChunkRow[]): Promise<void>;
  listChunks(sopId: string): Promise<ChunkRow[]>;
  putConfig(c: ConfigRow): Promise<void>;
  listConfigs(target?: string): Promise<ConfigRow[]>;
  /** Replaces the whole bank of the SOP. */
  putQuestions(sopId: string, qs: Question[]): Promise<void>;
  listQuestions(sopId: string): Promise<Question[]>;
  saveRun(r: RunRow): Promise<void>;
  /** Newest first. */
  listRuns(sopId: string, limit?: number): Promise<RunRow[]>;
  /** Append-only: the first entry must continue the stored head (or start at seq 1 on GENESIS). */
  appendLog(entries: TuningEntry[]): Promise<void>;
  getLog(): Promise<TuningEntry[]>;
}

/** The entries must continue the stored log without a gap or a fork. Both implementations call this. */
export function assertContinues(stored: TuningEntry[], add: TuningEntry[]): void {
  if (!add.length) return;
  const last = stored[stored.length - 1];
  if (add[0].seq !== (last?.seq ?? 0) + 1 || add[0].prev_hash !== (last?.hash ?? GENESIS)) throw new Error("the tuning log is append-only: these entries do not continue the stored log (someone else wrote first; reload)");
}

interface FileDb { sops: SopRow[]; chunks: ChunkRow[]; configs: ConfigRow[]; questions: (Question & { sop_id: string })[]; runs: RunRow[]; log: TuningEntry[] }
const empty = (): FileDb => ({ sops: [], chunks: [], configs: [], questions: [], runs: [], log: [] });

// ponytail: whole-file JSON rewrite, one process; the Supabase implementation is for anything shared.
export function fileKbStore(file: string): KbStore {
  const read = (): FileDb => (existsSync(file) ? { ...empty(), ...(JSON.parse(readFileSync(file, "utf8")) as Partial<FileDb>) } : empty());
  const write = (d: FileDb) => {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(d, null, 1));
    renameSync(tmp, file);
  };
  const edit = async (f: (d: FileDb) => void) => { const d = read(); f(d); write(d); };
  return {
    putSop: (s) => edit((d) => { d.sops = [...d.sops.filter((x) => x.sop_id !== s.sop_id), s]; }),
    getSop: async (id) => read().sops.find((x) => x.sop_id === id) ?? null,
    putChunks: (id, rows) => edit((d) => { d.chunks = [...d.chunks.filter((x) => x.sop_id !== id), ...rows]; }),
    listChunks: async (id) => read().chunks.filter((x) => x.sop_id === id),
    putConfig: (c) => edit((d) => { d.configs = [...d.configs.filter((x) => x.id !== c.id), c]; }),
    listConfigs: async (t) => read().configs.filter((x) => !t || x.target === t),
    putQuestions: (id, qs) => edit((d) => { d.questions = [...d.questions.filter((x) => x.sop_id !== id), ...qs.map((q) => ({ ...q, sop_id: id }))]; }),
    listQuestions: async (id) => read().questions.filter((x) => x.sop_id === id).map((x) => ({ id: x.id, question: x.question, expect: x.expect, split: x.split })),
    saveRun: (r) => edit((d) => { d.runs = [...d.runs.filter((x) => x.id !== r.id), r].slice(-60); }),
    listRuns: async (id, limit = 20) => read().runs.filter((x) => x.sop_id === id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit),
    appendLog: (entries) => edit((d) => { assertContinues(d.log, entries); d.log.push(...entries); }),
    getLog: async () => read().log,
  };
}

/** First use: copy the SOP, its chunks (with the vectors built by scripts/build_sop_kb.ts) and the
 * seed question bank into the store. Does nothing if the SOP is already there. */
export async function seedStore(store: KbStore, sopId: string): Promise<void> {
  if (await store.getSop(sopId)) return;
  const { chunks, vectors } = loadSop(sopId);
  if (!chunks.length) throw new Error(`no knowledge base built for ${sopId}`);
  const first = chunks[0];
  const vecs = new Map(vectors ? vectors.ids.map((id, i) => [id, vectors.vectors[i]] as const) : []);
  await store.putSop({ sop_id: sopId, title: first.title.replace(/: [^:]+$/, ""), version: String(first.version), issuer: first.issuer, source_path: first.url, source_sha256: first.sha256, synthetic: true });
  await store.putChunks(sopId, chunks.map((c) => ({ chunk_id: c.chunk_id, sop_id: sopId, text: c.text, sha256: c.chunk_sha256, topics: c.topics, meta: { title: c.title, job_profile: c.job_profile ?? null, version: c.version }, embedding: vecs.get(c.chunk_id) ?? null })));
  await store.putQuestions(sopId, SEED_QUESTIONS);
}
