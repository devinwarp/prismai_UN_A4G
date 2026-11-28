import { approvedContractMap, type ContractState } from "./output-contract-log";
import { loadContractState } from "./output-contract-store";
import { saveTick } from "./profiles-store";
import { appendSkillVersion, planSkillVersion, replaySkillVersions, verifySkillVersions, type SkillBuildReason } from "./skill-versions";
import { appendSkillVersionLog, loadSkillVersionLog } from "./skill-version-store";
import { checkSopKbFor, writeSkillFor } from "./sop-kb-app";
import { usesLicensingReference } from "./sop-test-context";
import { loadAttachment } from "./sop-version-store";
import { friendlySkillReason } from "./sop/profile-health";

// THE ONE PLACE A JOB PROFILE'S SKILL IS BUILT AND STORED. Ticking a profile, rebuilding the knowledge base, re-extracting, and approving or withdrawing an output contract all come
// here, for every use case, so they cannot disagree. Before this, three callers built skills their own way and two of them ignored the approved contract, so re-ticking a profile
// left a stored skill that no longer matched what the tests were written against.
//
// What it does, in order: take the SOP version the use case is attached to; check its knowledge base is ready (or let the caller build it); take the output contract a person approved
// for this profile, if one is (a use case on the licensing reference has its own and is never given one); build the skill with it; store the skill and its hash on the profile; and, when it
// is a different skill from the latest, keep it as the next VERSION (skill-versions.ts). A version is never separately approved: the job holder's approval of the contract it carries is
// what made it part of the contracted requirement. Never throws: a refusal is a value with a reason.

export type RebuiltSkill =
  | { ok: true; path: string; sha256: string; written: boolean; /** The version this skill is: new when it changed, else the latest. Null when versions could not be kept (see `warning`). */ version: number | null; changed: boolean; warning?: string }
  | { ok: false; reason: string };

export interface RebuildOptions {
  /** Make the knowledge base ready first (the tick builds it when it is missing). Default: only check it. */
  ensureKb?: (sopId: string, version: number) => Promise<{ ok: boolean; reason: string }>;
  /** The contract state the caller has just written, so it need not be read again. */
  contractState?: ContractState;
}

export async function rebuildSkill(
  orgId: string,
  uc: { id: string; ext_id: string },
  profile: string,
  by: { id: string; label: string },
  why: SkillBuildReason,
  o: RebuildOptions = {},
): Promise<RebuiltSkill> {
  const att = await loadAttachment(orgId, uc.id);
  if (!att) return { ok: false, reason: "Attach an SOP to this use case first." };
  const kb = o.ensureKb ? await o.ensureKb(att.sop_id, att.version) : await checkSopKbFor(orgId, att.sop_id, att.version);
  if (!kb.ok) return { ok: false, reason: `The SOP's knowledge base is not ready (${kb.reason}). Build it first on the SOP page.` };

  const state = usesLicensingReference(uc.ext_id, att.sop_id) ? null : (o.contractState ?? (await loadContractState(orgId, uc.id, profile)));
  const sk = await writeSkillFor(orgId, att.sop_id, profile, att.version, state ? approvedContractMap(state) : undefined);
  if (!sk.ok) return { ok: false, reason: friendlySkillReason(sk.reason, profile) };
  const err = await saveTick(orgId, uc.id, att.sop_id, profile, true, by.id, { path: sk.path, sha256: sk.sha256 });
  if (err) return { ok: false, reason: err };

  // keep it as a version when it is a different skill. A log that cannot be written (its migration is not applied) does not undo the build: it is reported.
  try {
    const log = await loadSkillVersionLog(orgId, uc.id, profile);
    const chain = verifySkillVersions(log);
    if (!chain.ok) return { ok: true, path: sk.path, sha256: sk.sha256, written: sk.written, version: null, changed: false, warning: `The skill version log failed verification at entry ${chain.broken_seq}: ${chain.reason}` };
    const payload = planSkillVersion(log, {
      sha256: sk.sha256, markdown: sk.markdown, reason: why,
      contract_version: state?.approved?.version ?? null, contract_hash: state?.approved?.hash ?? null, sop_id: att.sop_id, sop_version: att.version,
    }, by.label);
    if (!payload) return { ok: true, path: sk.path, sha256: sk.sha256, written: sk.written, version: replaySkillVersions(log).at(-1)?.version ?? null, changed: false };
    const werr = await appendSkillVersionLog(orgId, uc.id, profile, appendSkillVersion(log[log.length - 1] ?? null, by.label, payload, new Date().toISOString()));
    if (werr) return { ok: true, path: sk.path, sha256: sk.sha256, written: sk.written, version: null, changed: true, warning: werr };
    return { ok: true, path: sk.path, sha256: sk.sha256, written: sk.written, version: Number(payload.version), changed: true };
  } catch (e) {
    return { ok: true, path: sk.path, sha256: sk.sha256, written: sk.written, version: null, changed: false, warning: e instanceof Error ? e.message : "The skill version could not be kept." };
  }
}
