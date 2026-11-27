import { STRUCTURING_AGENT, structureSop, type StructureResult } from "./sop-structure-agent";
import { appendStructureLog, loadStructureLog } from "./sop-structure-store";
import type { StructEntry } from "./sop-structure";

/** Is a model configured for the structuring step (TESTGEN_MODEL through the model provider)? The offline switch does not matter: the draft is only text. */
export const structuringAvailable = () => Boolean(process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY);

export type DraftOutcome =
  | { ok: true; entry: StructEntry; result: Extract<StructureResult, { ok: true }> }
  | { ok: false; error: string; status: number; usage?: unknown };

/** Ask the model to structure `source` and write the draft to the use case's log as PENDING. Used by the structuring route and by SOP intake. Nothing is attached or approved. */
export async function draftStructureFor(orgId: string, useCaseId: string, source: string, title: string): Promise<DraftOutcome> {
  const r = await structureSop(source, title || undefined);
  if (!r.ok) return { ok: false, error: r.error, status: 502, usage: r.usage };
  let log: StructEntry[];
  try { log = await loadStructureLog(orgId, useCaseId); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "The structuring log could not be read", status: 503 }; }
  const entry = { seq: (log.at(-1)?.seq ?? 0) + 1, at: new Date().toISOString(), actor: STRUCTURING_AGENT, kind: "drafted", payload: { source, title, model: r.model, checks: r.checks, llm: r.llm, usage: r.usage, attempt: r.attempts } } as StructEntry;
  const err = await appendStructureLog(orgId, useCaseId, entry);
  return err ? { ok: false, error: err, status: err.startsWith("Someone") ? 409 : 500 } : { ok: true, entry, result: r };
}
