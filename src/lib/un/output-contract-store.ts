import { createAdminClient } from "@/lib/supabase/admin";
import { approvedContractMap, replayContracts, type ContractEntry, type ContractState } from "./output-contract-log";

// The output-contract log of one use case and job profile (supabase/un-output-contract.sql, not applied yet). Append-only, hash-chained, oldest first.

const missing = (m: string) => (/un_output_contract_log|schema cache/i.test(m) ? "The output contract migration is missing. Apply supabase/un-output-contract.sql." : m);

export async function loadContractLog(orgId: string, useCaseId: string, profile: string): Promise<ContractEntry[]> {
  const { data, error } = await createAdminClient().from("un_output_contract_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId).eq("profile", profile);
  if (error) throw new Error(missing(error.message));
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as ContractEntry)
    .sort((a, b) => a.seq - b.seq);
}

/** Returns an error message, or null. A clash on (use case, profile, seq) means someone else wrote first. */
export async function appendContractLog(orgId: string, useCaseId: string, profile: string, e: ContractEntry): Promise<string | null> {
  const { error } = await createAdminClient().from("un_output_contract_log")
    .insert({ org_id: orgId, use_case_id: useCaseId, profile, seq: e.seq, kind: e.kind, at: e.at, actor: e.actor, payload: e.payload, prev_hash: e.prev_hash, hash: e.hash });
  return error ? (/duplicate|unique/i.test(error.message) ? "Someone else changed the output contract just now: reload and try again." : missing(error.message)) : null;
}

/** The state of a profile's contract. A log that cannot be read (the table is not applied) counts as nothing approved, never as approved. */
export async function loadContractState(orgId: string, useCaseId: string, profile: string): Promise<ContractState> {
  return replayContracts(await loadContractLog(orgId, useCaseId, profile).catch(() => []));
}

/** The same, but a log that cannot be read is said so (the migration is missing), so a gate can tell a person to apply it instead of asking them to approve what they cannot. */
export async function readContractState(orgId: string, useCaseId: string, profile: string): Promise<{ ok: true; state: ContractState } | { ok: false; error: string }> {
  try { return { ok: true, state: replayContracts(await loadContractLog(orgId, useCaseId, profile)) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "The output contract could not be read." }; }
}

/** What the skill builders take: the approved contract of each task, or undefined (then the skill carries the contract read off the SOP's text). */
export async function loadApprovedContracts(orgId: string, useCaseId: string, profile: string) {
  return approvedContractMap(await loadContractState(orgId, useCaseId, profile));
}
