import { createAdminClient } from "@/lib/supabase/admin";
import { effectiveGates, EMPTY_GOV, replayGov, type Effective, type GovEntry, type GovState } from "./gates";
import type { UnUseCase } from "./model";

/** The org's gate log, oldest first. Empty if the table is absent (supabase/un-gates.sql not applied). */
export async function loadGovLog(orgId: string): Promise<GovEntry[]> {
  const { data } = await createAdminClient().from("un_gate_log").select("*").eq("org_id", orgId);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as GovEntry)
    .sort((a, b) => a.seq - b.seq);
}

export async function loadGov(orgId: string): Promise<GovState> {
  try {
    return replayGov(await loadGovLog(orgId));
  } catch {
    return EMPTY_GOV;
  }
}

export async function appendGovLog(orgId: string, entries: GovEntry[]): Promise<string | null> {
  if (!entries.length) return null;
  const { error } = await createAdminClient()
    .from("un_gate_log")
    .insert(entries.map((e) => ({ org_id: orgId, seq: e.seq, kind: e.kind, at: e.at, actor: e.actor, payload: e.payload, prev_hash: e.prev_hash, hash: e.hash })));
  return error?.message ?? null;
}

export const factsOf = (u: Pick<UnUseCase, "client_facing" | "affects_rights" | "irreversible">) => ({ client_facing: u.client_facing, affects_rights: u.affects_rights, irreversible: u.irreversible });

/** Effective gates of one use case right now (computed again each time a verdict runs). */
export async function effectiveFor(orgId: string, uc: UnUseCase): Promise<Effective> {
  return effectiveGates({ ext: uc.ext_id, facts: factsOf(uc), gov: await loadGov(orgId) });
}
