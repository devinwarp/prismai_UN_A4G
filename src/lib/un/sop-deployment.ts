import { createHash } from "node:crypto";
import { canon, type LogEntry } from "./tuning.ts";

// What goes into production for an SOP-based job profile: the SKILL together with the TUNED GUIDANCE the pilot found, as one immutable, hashed snapshot.
//
// The path: the pilot's certify pass records, per job profile, what was certified (the skill, the guidance the best round used, the tests, the parameters, the
// report) as a `certification` entry of the use case's hash-chained tuning log. The business process owner signs the final pilot result (the `approval` entry of
// the same log). At the DEPLOYMENT step the certified profiles are frozen into a snapshot, its hash is generated, and the snapshot goes into the production log.
// What the deployed agent runs on is assembleAgent(snapshot): the skill and the approved guidance, never a loose prompt, and its hash is the snapshot's.
// Pure: the routes read and write the logs.

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const GUIDANCE_PREAMBLE = "Task guidance found by tuning against the approved tests and certified with this skill. It is subordinate to the skill, the SOP and the controls:";

export interface CertifiedProfile {
  profile: string;
  sop_id: string;
  sop_version: number;
  skill_sha256: string;
  /** The skill as it was certified, so what runs is exactly what was tested whatever happens to the SOP later. */
  skill_markdown: string;
  /** The tuned task guidance the best round used ("" when the skill alone met the bar). */
  guidance: string;
  guidance_sha256: string;
  report_id: string;
  test_hash: string;
  params_hash: string;
}

/** What the certify pass records in the pilot report's plan: what the report is about. The certification entry is written from it once the FINAL report (goal review approved) is met. */
export type CertifiedData = Omit<CertifiedProfile, "report_id" | "guidance_sha256">;

/** The certification payload for a met final report, from the plan the certify pass stored; null for a pilot that did not come from the SOP pilot. */
export function certificationFromPlan(plan: unknown, reportId: string): Record<string, unknown> | null {
  const c = plan && typeof plan === "object" ? (plan as { certified?: CertifiedData }).certified : undefined;
  return c && typeof c.profile === "string" && typeof c.skill_sha256 === "string" ? certificationPayload({ ...c, report_id: reportId, met: true }) : null;
}

export const guidanceHash = (guidance: string) => sha(guidance.trim());

/** The payload of the `certification` entry the certify pass appends to the tuning log. `met` is what approvalState reads. */
export function certificationPayload(p: Omit<CertifiedProfile, "guidance_sha256"> & { met: boolean }): Record<string, unknown> {
  const { met, ...rest } = p;
  return { met, kind: "sop", ...rest, guidance_sha256: guidanceHash(rest.guidance) };
}

/** The certification of each job profile as of now: the latest SOP certification entry per profile. Entries of the licence-renewal reference are not SOP entries and are skipped. */
export function sopCertifications(tuning: LogEntry[]): Map<string, CertifiedProfile> {
  const out = new Map<string, CertifiedProfile>();
  for (const e of tuning) {
    if (e.kind !== "certification" || e.payload.kind !== "sop") continue;
    const p = e.payload as unknown as CertifiedProfile & { met?: boolean };
    if (p.met === true) out.set(p.profile, p); else out.delete(p.profile);
  }
  return out;
}

export interface DeploymentSnapshot { kind: "sop"; sop_id: string; sop_version: number; profiles: CertifiedProfile[] }

/** Freeze the certified profiles into one snapshot and generate its hash. Profiles are in name order so the hash does not depend on the order they were certified. */
export function snapshotOf(profiles: Iterable<CertifiedProfile>): { snapshot: DeploymentSnapshot; sha256: string } {
  const list = [...profiles].sort((a, b) => a.profile.localeCompare(b.profile));
  const snapshot: DeploymentSnapshot = { kind: "sop", sop_id: list[0]?.sop_id ?? "", sop_version: list[0]?.sop_version ?? 0, profiles: list };
  return { snapshot, sha256: sha(canon(snapshot)) };
}

/** Why a snapshot cannot be deployed as it stands, or []. The profile certified must still be the profile ticked, on the same SOP version and skill. */
export function snapshotProblems(snapshot: DeploymentSnapshot, now: { ticked: string[]; sop_id: string | null; sop_version: number | null; skill_sha256: Record<string, string | null> }): string[] {
  const out: string[] = [];
  if (!snapshot.profiles.length) return ["No job profile has a certified pilot."];
  for (const t of now.ticked) if (!snapshot.profiles.some((p) => p.profile === t)) out.push(`${t} is ticked for automation but has no certified pilot.`);
  for (const p of snapshot.profiles) {
    if (!now.ticked.includes(p.profile)) out.push(`${p.profile} was certified but is no longer ticked for automation.`);
    if (p.sop_id !== now.sop_id || p.sop_version !== now.sop_version) out.push(`${p.profile} was certified on SOP ${p.sop_id} version ${p.sop_version}, but the use case is now on ${now.sop_id ?? "no SOP"} version ${now.sop_version ?? "?"}: run the pilot again.`);
    else if (now.skill_sha256[p.profile] && now.skill_sha256[p.profile] !== p.skill_sha256) out.push(`The skill of ${p.profile} changed since it was certified: run the pilot again.`);
    if (p.guidance_sha256 !== guidanceHash(p.guidance)) out.push(`The guidance recorded for ${p.profile} does not match its hash.`);
  }
  return out;
}

/** What a deployed job profile's agent runs on: the certified skill, then the certified guidance. Its hash is stable for a snapshot. */
export function assembleAgent(p: CertifiedProfile): { system: string; sha256: string } {
  const system = p.guidance.trim() ? `${p.skill_markdown.trimEnd()}\n\n## Tuned task guidance\n${GUIDANCE_PREAMBLE}\n${p.guidance.trim()}\n` : p.skill_markdown;
  return { system, sha256: sha(`${p.skill_sha256}:${p.guidance_sha256}`) };
}

/** The deployed snapshot of a use case, read back from the production log's `deployed` entry (null when the deployment is not an SOP one). */
export function deployedSnapshot(watch: { kind: string; payload: Record<string, unknown> }[]): { snapshot: DeploymentSnapshot; sha256: string } | null {
  for (let i = watch.length - 1; i >= 0; i--) {
    const e = watch[i];
    if (e.kind === "deployed") return e.payload.snapshot && e.payload.snapshot_sha256 ? { snapshot: e.payload.snapshot as DeploymentSnapshot, sha256: String(e.payload.snapshot_sha256) } : null;
  }
  return null;
}

/** A recomputed snapshot hash, so a reader can check that a stored snapshot is the one that was deployed. */
export const snapshotHash = (snapshot: DeploymentSnapshot) => sha(canon(snapshot));
