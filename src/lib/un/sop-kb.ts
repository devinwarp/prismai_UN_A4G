import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Chunk } from "./kb.ts";
import { embedQuery, hybridSearch, parseVectors, type HybridResult, type VectorFile } from "./vector.ts";

// A separate, per-use-case knowledge base built from an entity's own SOP. It is kept apart
// from kb/chunks.json on purpose: that file is regulatory text with its own eval, and
// parseVectors() requires every chunk to have a vector, so mixing the two would change what
// the regulatory search ranks. SOP chunks use the same Chunk shape, so hybridSearch,
// the BM25 index and the vector file format are reused unchanged.
//
// What is indexed: everything in the SOP up to (not including) the Annex. The Annex is the
// answer key a test compares an analyzer against; an agent that could retrieve it would be
// retrieving the answers.

export interface SopMeta {
  /** e.g. "SOP-LIC-014" */
  sopId: string;
  version: string;
  useCaseId: string;
  entity: string;
  /** repo-relative path of the source, shown as the citation url */
  sourcePath: string;
}

export interface SopChunk extends Chunk {
  use_case_id: string;
  version: string;
  section: string;
  /** Task ids the chunk is about or mentions (T01 to T20). */
  task_ids: string[];
  job_profile: string | null;
  /** Always true for the demo SOPs: lets a caller refuse to present them as real. */
  synthetic: boolean;
  /** SHA-256 of this chunk's text, so a stale vector can be told from a current one. */
  chunk_sha256: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const MAX = 1800;

/** The part of the SOP an agent may retrieve: everything before the Annex. */
export function retrievablePart(md: string): string {
  const at = md.search(/^## Annex\b/m);
  return (at < 0 ? md : md.slice(0, at)).replace(/\r\n/g, "\n");
}

const KIND: [RegExp, string][] = [
  [/^T\d{2}$/, "task"],
  [/^(D\d|SUB|VAL)$/, "required-documents"],
  [/^R\d$/, "decision-rule"],
  [/^Q\d+$/, "faq"],
  [/^S3\.\d$/, "role"],
  [/^STEP-\d$/, "procedure"],
];
const SECTION_KIND: Record<string, string> = { S1: "purpose", S2: "scope", S5: "timings", S6: "fees", S7: "controls", S8: "escalation", S9: "records" };

function keyOf(h2: string, h3: string | null): string {
  if (h3) {
    const a = /^([A-Z]{1,3}\d{1,2}|SUB|VAL)\./.exec(h3);
    if (a) return a[1];
    const b = /^(\d+\.\d+)\s/.exec(h3);
    if (b) return `S${b[1]}`;
    const c = /^Step (\d+)\./.exec(h3);
    if (c) return `STEP-${c[1]}`;
    return `S${slug(h2)}-${slug(h3)}`;
  }
  const n = /^(\d+)\.\s/.exec(h2);
  return n ? `S${n[1]}` : `S${slug(h2)}`;
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);

interface Block { h2: string; h3: string | null; lines: string[] }

function blocks(text: string): Block[] {
  const out: Block[] = [];
  let cur: Block = { h2: "Document control", h3: null, lines: [] };
  const push = () => { if (cur.lines.join("").trim()) out.push(cur); };
  for (const line of text.split("\n")) {
    if (/^# /.test(line)) { cur.lines.push(line.replace(/^# /, "")); continue; }
    const h2 = /^## (.+)$/.exec(line);
    const h3 = /^### (.+)$/.exec(line);
    if (h2) { push(); cur = { h2: h2[1].trim(), h3: null, lines: [] }; continue; }
    if (h3) { push(); cur = { h2: cur.h2, h3: h3[1].trim(), lines: [] }; continue; }
    if (line.trim() === "---") continue;
    cur.lines.push(line);
  }
  push();
  return out;
}

function split(body: string): string[] {
  if (body.length <= MAX) return [body];
  const parts: string[] = [];
  let cur = "";
  for (const line of body.split("\n")) {
    if (cur && (cur + "\n" + line).length > MAX) { parts.push(cur.trim()); cur = ""; }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Cut an SOP into retrievable chunks: one per task, document, rule, question, role,
 * step table or section, each led by a breadcrumb so it reads on its own. */
export function chunkSop(md: string, meta: SopMeta): SopChunk[] {
  const text = retrievablePart(md);
  const sourceSha = sha(text);
  const title = (/^# (.+)$/m.exec(text)?.[1] ?? meta.sopId).trim();
  const chunks: SopChunk[] = [];
  const seen = new Map<string, number>();
  for (const b of blocks(text)) {
    const key = keyOf(b.h2, b.h3);
    const body = b.lines.join("\n").trim();
    const kind = KIND.find(([re]) => re.test(key))?.[1] ?? SECTION_KIND[key] ?? (b.h3 ? "section" : "overview");
    const crumb = [`${meta.sopId} v${meta.version}`, b.h2, b.h3].filter(Boolean).join(" | ");
    for (const part of split(body)) {
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      const id = n === 1 ? key : `${key}~${n}`;
      const full = `${crumb}\n${part}`;
      const tasks = [...new Set(full.match(/\bT\d{2}\b/g) ?? [])].sort();
      chunks.push({
        chunk_id: `${meta.sopId}#${id}`,
        source_id: meta.sopId,
        text: full,
        sha256: sourceSha,
        title: b.h3 ? `${title}: ${b.h3}` : `${title}: ${b.h2}`,
        url: meta.sourcePath,
        issuer: meta.entity,
        jurisdiction: "Marsa (fictitious)",
        instrument_type: "sop",
        binding: false,
        date: null,
        topics: [kind],
        matrix_quadrants: [],
        use_case_id: meta.useCaseId,
        version: meta.version,
        section: b.h2,
        task_ids: tasks,
        job_profile: /\*\*Job profile:\*\*\s*([^.\n]+)/.exec(part)?.[1].trim() ?? null,
        synthetic: true,
        chunk_sha256: sha(full),
      });
    }
  }
  return chunks;
}

/** Pull "SOP-LIC-014" style metadata out of the SOP's own control table. */
export function sopMetaFrom(md: string, sourcePath: string): SopMeta {
  const cell = (field: string) => new RegExp(`^\\|\\s*${field}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, "m").exec(md)?.[1];
  const sopId = cell("Document id");
  const version = cell("Version")?.replace(/\s*\(.*\)\s*$/, "");
  const uc = /UC\d+/.exec(cell("Related use case") ?? "")?.[0];
  const owner = /,\s*(.+)$/.exec(cell("Owner") ?? "")?.[1];
  if (!sopId || !version || !uc || !owner) throw new Error("SOP control table is missing Document id, Version, Related use case or Owner");
  return { sopId, version, useCaseId: uc, entity: `${owner} (fictitious)`, sourcePath };
}

export interface SopVectorFile extends VectorFile {
  source_sha256: string;
  chunk_sha256: Record<string, string>;
}

const root = () => path.join(process.cwd(), "kb", "sop");
const cache = new Map<string, { chunks: SopChunk[]; vectors: VectorFile | null }>();

/** Chunks (and vectors, when built and in step with the chunks) for one SOP. */
export function loadSop(sopId: string): { chunks: SopChunk[]; vectors: VectorFile | null } {
  const hit = cache.get(sopId);
  if (hit) return hit;
  let chunks: SopChunk[] = [];
  let vectors: VectorFile | null = null;
  try {
    const dir = path.join(root(), sopId);
    chunks = JSON.parse(readFileSync(path.join(dir, "chunks.json"), "utf8")) as SopChunk[];
    const f = path.join(dir, "vectors.json");
    vectors = existsSync(f) ? parseVectors(JSON.parse(readFileSync(f, "utf8")), chunks) : null;
  } catch {
    chunks = [];
  }
  const out = { chunks, vectors };
  cache.set(sopId, out);
  return out;
}

/** Search one SOP. BM25 always; fused with vector similarity when vectors exist and
 * KB_VECTOR=on, exactly as for the regulatory KB. Every hit is a citable chunk id. */
export async function searchSop(sopId: string, query: string, opts: { k?: number; kind?: string } = {}): Promise<HybridResult> {
  const { chunks, vectors } = loadSop(sopId);
  const pool = opts.kind ? chunks.filter((c) => c.topics.includes(opts.kind!)) : chunks;
  const qv = vectors ? await embedQuery(query) : null;
  return hybridSearch(pool, vectors, qv, query, { k: opts.k ?? 5 });
}

// ---- Mandatory vectorisation and skill extraction ---------------------------------------
// A process picked for automation must be vectorised first: the agent retrieves from the SOP
// at run time, so an agent without current vectors is refused, not quietly downgraded to
// keyword search. The skill file that becomes the agent's instructions is assembled from the
// SOP's own text (no wording of ours), and records which SOP version it came from.

export interface VectorStatus { ok: boolean; reason: string }

/** Are the vectors present and in step with the chunks (same ids, same text hashes)? */
export function vectorStatus(chunks: SopChunk[], vectors: SopVectorFile | null): VectorStatus {
  if (!chunks.length) return { ok: false, reason: "no chunks: build the SOP knowledge base first" };
  if (!vectors) return { ok: false, reason: "no vectors: run scripts/build_sop_kb.ts without --no-embed" };
  const stale = chunks.filter((c) => vectors.chunk_sha256?.[c.chunk_id] !== c.chunk_sha256).map((c) => c.chunk_id);
  if (stale.length) return { ok: false, reason: `vectors are out of date for ${stale.length} chunk(s), e.g. ${stale[0]}: rebuild` };
  return { ok: true, reason: "vectors current" };
}

/** Throws unless the SOP is vectorised and current. */
export function requireVectorised(sopId: string): void {
  const { chunks, vectors } = loadSop(sopId);
  const s = vectorStatus(chunks, vectors as SopVectorFile | null);
  if (!s.ok) throw new Error(`${sopId} cannot be used by an automated agent: ${s.reason}`);
}

/** Retrieval for an automated agent: refuses when the SOP is not vectorised or the query
 * cannot be embedded (KB_VECTOR off, model unavailable), instead of falling back to BM25. */
export async function searchSopForAgent(sopId: string, query: string, opts: { k?: number; kind?: string } = {}): Promise<HybridResult> {
  requireVectorised(sopId);
  const r = await searchSop(sopId, query, opts);
  if (r.mode !== "hybrid") throw new Error("vector retrieval is required for automated agents but the query could not be embedded (set KB_VECTOR=on and check the model loads)");
  return r;
}

const body = (c: SopChunk) => c.text.split("\n").slice(1).join("\n").trim();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export interface SkillFile { name: string; path: string; markdown: string; chunkIds: string[] }

/** The agent's instructions for one job profile, assembled verbatim from the SOP chunks:
 * the profile's role and authority, each of its tasks, the controls and escalation table,
 * and the rule to retrieve and cite before acting. Throws if the SOP is not vectorised. */
export function extractSkill(sopId: string, profile: string): SkillFile {
  requireVectorised(sopId);
  const { chunks } = loadSop(sopId);
  const roleChunk = chunks.find((c) => c.topics.includes("role") && c.title.toLowerCase().includes(profile.toLowerCase()));
  if (!roleChunk) throw new Error(`no job profile named "${profile}" in ${sopId}`);
  const tasks = chunks.filter((c) => c.topics.includes("task") && c.job_profile?.toLowerCase() === profile.toLowerCase());
  if (!tasks.length) throw new Error(`job profile "${profile}" has no tasks in ${sopId}`);
  const pick = (t: string) => chunks.filter((c) => c.topics.includes(t));
  const first = chunks[0];
  const name = `${sopId.toLowerCase()}-${slugify(profile)}`;
  const used = [roleChunk, ...tasks, ...pick("controls"), ...pick("escalation")];
  const md = [
    "---",
    `name: ${name}`,
    `description: Instructions for the agent that performs the ${profile} job profile of ${sopId} (${first.issuer}). Use when a case reaches this profile's tasks.`,
    `source: ${first.url}`,
    `sop: ${sopId}`,
    `version: ${first.version}`,
    `use_case: ${first.use_case_id}`,
    `source_sha256: ${first.sha256}`,
    "synthetic: true",
    "---",
    "",
    `# ${profile}: agent instructions`,
    "",
    "Everything below is copied from the SOP. Follow it as written. Where this skill and a retrieved SOP passage differ, the retrieved passage and its version win.",
    "",
    "## Before you act",
    `1. Retrieve from the ${sopId} knowledge base (vector retrieval is required) for the case in front of you, for example the documents required, a decision rule, or the fee table.`,
    "2. Work in a loop of Thought, Action, Observation. Think about what the SOP would have to say; search; read what came back. If the passages do not answer the question, rewrite the query in the SOP's own words (for example \"permit\" is \"licence\", \"papers\" is \"documents\", \"tenancy\" is \"lease\"), narrow it to the kind of passage you need, or split a compound question and search each part.",
    "3. Cite the chunk id of every passage you rely on, such as `" + `${sopId}#D2` + "`. Quote the SOP; do not paraphrase a rule or a figure.",
    "4. If, after searching and rewriting, no passage supports an answer, the information is outside this knowledge base. You MUST call the tool `request_outside_information` with the question and what you tried. Do not answer from memory, from other procedures, or from what seems likely. This includes anything about a place, person, body or law the SOP never mentions.",
    "5. Do what only this profile may do (below). Anything outside it goes to the role named in the escalation table.",
    "",
    "## Role and authority",
    body(roleChunk),
    "",
    "## Your tasks",
    ...tasks.flatMap((t) => [`### ${t.chunk_id.split("#")[1]}`, body(t).replace(/^- \*\*Job profile:\*\*[^\n]*\n?/, ""), ""]),
    "## Controls that apply to every action",
    ...pick("controls").map(body),
    "",
    "## Escalation",
    ...pick("escalation").map(body),
    "",
  ].join("\n");
  return { name, path: `kb/sop/${sopId}/skills/${name}.SKILL.md`, markdown: md, chunkIds: used.map((c) => c.chunk_id) };
}
