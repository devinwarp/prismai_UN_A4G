import { createHash } from "node:crypto";
import type { OutputContract } from "./output-contract.ts";
import { appendEntry, canon, verifyChain, type ChainEntry } from "./tuning.ts";

// The OUTPUT CONTRACT of a job profile as something a PERSON approves. The contract of each task is first derived from the SOP's own text (output-contract.ts); the job
// position holder (the person who does this job, or the process owner) then checks it, may change what the task returns and the outcomes it chooses between, and approves
// it. The approval is what the skill carries, what the tests are written against, and what the pilot checks. Until it is approved the profile has no tests and no pilot.
// The SOP itself is never edited here: the contract is a layer on it, kept in its own append-only, hash-chained log (the same kind as the verdict parameters).
// Pure: the route and the store read and write the log.

export type ContractKind = "proposed" | "approved" | "withdrawn";
export type ContractEntry = ChainEntry<ContractKind>;

/** Where a proposal came from: read off the SOP's text by the platform, or written by a person. */
export type ContractSource = "derived" | "person";
export const CONTRACT_AGENT = { id: "agent:contracts", email: "Output contract agent" } as const;

export const contractsHash = (tasks: OutputContract[]): string =>
  createHash("sha256").update(canon([...tasks].sort((a, b) => a.task.localeCompare(b.task)))).digest("hex");

export interface ApprovedContracts { version: number; hash: string; tasks: OutputContract[]; approver: string; approver_source: string; at: string; by: string; /** The approver wrote what they approved (they edited it at the review). Recorded, never refused. */ edited_by_approver?: boolean; self_approval_reason?: string }
export interface ContractState {
  /** The latest proposal that has not been approved. */
  pending: { version: number; tasks: OutputContract[]; source: ContractSource; by: string; note?: string } | null;
  /** The approval in force, or null. */
  approved: ApprovedContracts | null;
  proposals: number;
}
export const EMPTY_CONTRACTS: ContractState = { pending: null, approved: null, proposals: 0 };

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function replayContracts(entries: ContractEntry[]): ContractState {
  const s: ContractState = { pending: null, approved: null, proposals: 0 };
  for (const e of entries) {
    const p = e.payload;
    if (e.kind === "proposed") {
      s.proposals += 1;
      s.pending = { version: s.proposals, tasks: p.tasks as OutputContract[], source: p.source === "person" ? "person" : "derived", by: str(p.by), ...(str(p.note) ? { note: str(p.note) } : {}) };
    } else if (e.kind === "approved") {
      s.approved = { version: Number(p.version), hash: str(p.hash), tasks: p.tasks as OutputContract[], approver: str(p.approver), approver_source: str(p.approver_source), at: e.at, by: str(p.by), ...(p.edited_by_approver === true ? { edited_by_approver: true } : {}), ...(str(p.self_approval_reason) ? { self_approval_reason: str(p.self_approval_reason) } : {}) };
      s.pending = null;
    } else if (e.kind === "withdrawn") {
      s.approved = null;
    }
  }
  return s;
}

/** The approved contract of each task, for the skill builders; undefined when nothing is approved. */
export const approvedContractMap = (s: ContractState): ReadonlyMap<string, OutputContract> | undefined => (s.approved ? new Map(s.approved.tasks.map((t) => [t.task, t])) : undefined);

// ---- validation ----------------------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const OUTPUT_MAX = 300;
const VALUE_MAX = 40;
const VALUES_MAX = 8;

/** The contract list a person (or the platform) proposes: every task of the profile once, the output as short text, and the outcomes, if any, as 2 to 8 distinct short words. */
export function validateContracts(raw: unknown, taskIds: string[]): { ok: true; tasks: OutputContract[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "tasks must be a list" };
  const out: OutputContract[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isObj(item)) return { ok: false, error: "each task must be an object" };
    const task = str(item.task).trim();
    if (!taskIds.includes(task)) return { ok: false, error: `${task || "A task"} is not a task of this job profile` };
    if (seen.has(task)) return { ok: false, error: `${task} appears twice` };
    seen.add(task);
    const output = str(item.output).trim();
    if (output.length > OUTPUT_MAX) return { ok: false, error: `${task}: what the task produces is at most ${OUTPUT_MAX} characters` };
    let decision: string[] | null = null;
    if (item.decision !== null && item.decision !== undefined) {
      if (!Array.isArray(item.decision)) return { ok: false, error: `${task}: the outcomes must be a list, or empty for a task that makes no choice` };
      const values = item.decision.map((v) => str(v).trim()).filter(Boolean);
      if (values.length) {
        if (values.length < 2) return { ok: false, error: `${task}: a choice needs at least two outcomes (or none, for a task that makes no choice)` };
        if (values.length > VALUES_MAX) return { ok: false, error: `${task}: at most ${VALUES_MAX} outcomes` };
        if (values.some((v) => v.length > VALUE_MAX)) return { ok: false, error: `${task}: each outcome is at most ${VALUE_MAX} characters` };
        if (values.some((v) => /["“”\n]/.test(v))) return { ok: false, error: `${task}: an outcome is plain words, without quotation marks` };
        if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) return { ok: false, error: `${task}: the outcomes must differ from each other` };
        decision = values;
      }
    }
    out.push({ task, output, decision });
  }
  const missing = taskIds.filter((t) => !seen.has(t));
  if (missing.length) return { ok: false, error: `The contract must cover every task of the job profile; missing ${missing.join(", ")}` };
  return { ok: true, tasks: taskIds.map((t) => out.find((o) => o.task === t)!) };
}

// ---- actions -------------------------------------------------------------------------------------------------------------

export type ContractAction =
  | { type: "propose"; tasks: unknown; source: ContractSource; note?: string }
  | { type: "approve"; approver: { title: string; source: string } }
  | { type: "withdraw"; reason: string };

export type ContractPlan = { ok: true; kind: ContractKind; payload: Record<string, unknown> } | { ok: false; error: string };
const bad = (error: string): ContractPlan => ({ ok: false, error });

export function planContracts(state: ContractState, a: ContractAction, by: string, taskIds: string[]): ContractPlan {
  if (a.type === "propose") {
    const v = validateContracts(a.tasks, taskIds);
    if (!v.ok) return bad(v.error);
    if (state.approved && !state.pending && contractsHash(v.tasks) === state.approved.hash) return bad("This contract is already approved and nothing has changed");
    if (state.pending && contractsHash(v.tasks) === contractsHash(state.pending.tasks) && a.source === state.pending.source) return bad("This is the proposal already waiting for approval");
    return { ok: true, kind: "proposed", payload: { tasks: v.tasks, source: a.source, ...(a.note ? { note: a.note } : {}), by } };
  }
  if (a.type === "approve") {
    if (!state.pending) return bad("There is no proposal waiting for approval");
    const v = validateContracts(state.pending.tasks, taskIds);
    if (!v.ok) return bad(`The proposal no longer fits the job profile: ${v.error}`);
    // the holder of the job writes and approves what their job's agent returns: an edit made at the review is part of the approval, so there is no second approval and no reason to give.
    // That the approver wrote it is recorded.
    const own = !!by && state.pending.by === by;
    return { ok: true, kind: "approved", payload: { version: state.pending.version, hash: contractsHash(v.tasks), tasks: v.tasks, approver: a.approver.title, approver_source: a.approver.source, by, ...(own ? { edited_by_approver: true } : {}) } };
  }
  if (!state.approved) return bad("There is no approval to withdraw");
  if (str(a.reason).trim().length < 3) return bad("Withdrawing an approval needs a reason");
  return { ok: true, kind: "withdrawn", payload: { version: state.approved.version, reason: a.reason.trim(), by } };
}

export const appendContract = (prev: ContractEntry | null, kind: ContractKind, actor: string, payload: Record<string, unknown>, at: string): ContractEntry => appendEntry<ContractKind>(prev, kind, actor, payload, at);
export const verifyContracts = (entries: ContractEntry[]) => verifyChain(entries);

/** In what capacity a person may change, approve or withdraw the output format of a job profile. The HOLDER of the job (their job title on their profile is the profile's name) may,
 * and so may the process owner, as the fallback when nobody holds the job or the owner has to step in. Nobody else may, whatever role they hold: an operator of the use case who does
 * another job has no say in what this job's agent returns. The approver recorded in the log is what the person signs as, never chosen from a list. */
export type ContractSigner = { ok: true; as: "holder" | "process_owner"; approver: { title: string; source: "job_title" | "process_owner" } } | { ok: false; error: string };
export function contractSigner(o: { profile: string; signerTitle: string | null; isProcessOwner: boolean; processOwnerTitle: string | null }): ContractSigner {
  const holds = !!o.signerTitle && o.signerTitle.trim().toLowerCase() === o.profile.trim().toLowerCase();
  if (holds) return { ok: true, as: "holder", approver: { title: o.profile.trim(), source: "job_title" } };
  if (o.isProcessOwner) return { ok: true, as: "process_owner", approver: { title: o.processOwnerTitle?.trim() || "Process owner", source: "process_owner" } };
  return { ok: false, error: `Only the holder of the job "${o.profile}" (a person whose job title is "${o.profile}") or the process owner can change or approve what its tasks return.` };
}

/** Do the contracts the SOP's text gives now differ from the approved ones? Then the SOP changed (or the way contracts are read did) since the approval, and a person should look again. */
export const contractsDrifted = (derived: OutputContract[], s: ContractState): boolean => !!s.approved && contractsHash(derived) !== s.approved.hash;
