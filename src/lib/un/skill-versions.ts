import { appendEntry, verifyChain, type ChainEntry } from "./tuning.ts";

// SKILL VERSIONS. A job profile's skill is built from the SOP and from the output contract a person approved, and it changes when either does. Every build that gives a different
// skill is a new VERSION of it, kept in an append-only, hash-chained log with the skill text itself, why it was built, and what it was built from. So what ran in a pilot, what was
// certified and what was deployed can always be read back, and a version is never edited. The platform builds it; nobody approves a version separately: the approval that mattered
// is the job holder's approval of the output contract it carries (output-contract-log.ts). Pure: the store reads and writes the log.

export type SkillVersionKind = "built";
export type SkillVersionEntry = ChainEntry<SkillVersionKind>;

/** Why a build happened. */
export type SkillBuildReason = "ticked" | "kb_rebuilt" | "reextracted" | "contract_approved" | "contract_withdrawn";

export interface SkillBuild {
  sha256: string;
  markdown: string;
  reason: SkillBuildReason;
  /** The contract the skill carries: its approved version and hash, or null for a skill built from the SOP's text alone. */
  contract_version: number | null;
  contract_hash: string | null;
  sop_id: string;
  sop_version: number;
}

export interface SkillVersion extends SkillBuild { version: number; by: string; at: string }

const num = (v: unknown) => (typeof v === "number" ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function replaySkillVersions(entries: SkillVersionEntry[]): SkillVersion[] {
  return entries.filter((e) => e.kind === "built").map((e) => ({
    version: Number(e.payload.version), sha256: str(e.payload.sha256), markdown: str(e.payload.markdown), reason: str(e.payload.reason) as SkillBuildReason,
    contract_version: num(e.payload.contract_version), contract_hash: e.payload.contract_hash === null ? null : str(e.payload.contract_hash),
    sop_id: str(e.payload.sop_id), sop_version: Number(e.payload.sop_version), by: str(e.payload.by), at: e.at,
  }));
}

/** The payload of the next version, or null when the skill built is the one already latest (a rebuild that changes nothing is not a new version). */
export function planSkillVersion(entries: SkillVersionEntry[], b: SkillBuild, by: string): Record<string, unknown> | null {
  const all = replaySkillVersions(entries);
  const last = all[all.length - 1];
  if (last && last.sha256 === b.sha256) return null;
  return { version: (last?.version ?? 0) + 1, sha256: b.sha256, markdown: b.markdown, reason: b.reason, contract_version: b.contract_version, contract_hash: b.contract_hash, sop_id: b.sop_id, sop_version: b.sop_version, by };
}

export const appendSkillVersion = (prev: SkillVersionEntry | null, actor: string, payload: Record<string, unknown>, at: string): SkillVersionEntry => appendEntry<SkillVersionKind>(prev, "built", actor, payload, at);
export const verifySkillVersions = (entries: SkillVersionEntry[]) => verifyChain(entries);

/** The version a skill hash is, or null (a skill built before versions existed, or never recorded). */
export const versionOfHash = (versions: SkillVersion[], sha256: string | null): number | null => (sha256 ? versions.find((v) => v.sha256 === sha256)?.version ?? null : null);
