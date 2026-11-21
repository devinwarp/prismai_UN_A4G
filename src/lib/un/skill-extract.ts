import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chunkSop, extractSkill, sopMetaFrom, vectorStatus, type SopChunk, type SopVectorFile } from "./sop-kb.ts";

// Library form of scripts/extract_skill.ts: what ticking "Automate" on a job profile runs.
// Server-only (reads kb/sop/<id>/ from disk). Never throws: a refusal is a value with a reason.

export interface KbCheck { ok: boolean; reason: string }

/** Is kb/sop/<id>/ built, vectorised with vectors that match its chunks, and in step with the SOP file as it is now? */
export function checkSopKb(sopId: string, root = process.cwd()): KbCheck {
  const dir = path.join(root, "kb", "sop", sopId);
  const cf = path.join(dir, "chunks.json");
  if (!existsSync(cf)) return { ok: false, reason: "no knowledge base for this SOP: run node scripts/build_sop_kb.ts <sop.md>" };
  try {
    const chunks = JSON.parse(readFileSync(cf, "utf8")) as SopChunk[];
    const vf = path.join(dir, "vectors.json");
    const vectors = existsSync(vf) ? (JSON.parse(readFileSync(vf, "utf8")) as SopVectorFile) : null;
    const st = vectorStatus(chunks, vectors);
    if (!st.ok) return st;
    const src = path.join(root, chunks[0].url);
    if (existsSync(src)) {
      const md = readFileSync(src, "utf8");
      const now = chunkSop(md, sopMetaFrom(md, chunks[0].url));
      if (now.length !== chunks.length || now.some((c, i) => c.chunk_sha256 !== chunks[i].chunk_sha256)) {
        return { ok: false, reason: `${chunks[0].url} has changed since the knowledge base was built: rebuild it` };
      }
    }
    return { ok: true, reason: "vectors current" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "knowledge base unreadable" };
  }
}

export type SkillResult = { ok: true; path: string; sha256: string; written: boolean } | { ok: false; reason: string };

/** Extracts one profile's skill file after checking the knowledge base. A read-only disk is not an error: the skill is still valid and `written` is false. */
export function writeSkill(sopId: string, profile: string, root = process.cwd()): SkillResult {
  const kb = checkSopKb(sopId, root);
  if (!kb.ok) return { ok: false, reason: kb.reason };
  try {
    const skill = extractSkill(sopId, profile);
    const sha256 = createHash("sha256").update(skill.markdown).digest("hex");
    const file = path.join(root, skill.path);
    try {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, skill.markdown);
      return { ok: true, path: skill.path, sha256, written: true };
    } catch {
      return { ok: true, path: skill.path, sha256, written: false };
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "skill extraction failed" };
  }
}
