import type { Quadrant, UnUseCase } from "../model.ts";
import type { SopAnalysis, SopInput } from "./types.ts";

// SopAnalysis -> one governed use case row (one per SOP, i.e. per business
// process, so the process-first compare page judges it as a unit). The row
// carries the three risk flags and leaves hitl_rule empty: hitl.ts derives the
// oversight rules from the flags, which is the point of the integration.

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const lines = (refs: { start: number; end: number }[]) =>
  [...new Set(refs.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`)))].join(", ");

export function toUseCase(a: SopAnalysis, input: Pick<SopInput, "title" | "metadata">): UnUseCase {
  const by = (c: string) => a.candidates.find((x) => x.class === c);
  const auto = by("automate")?.hours_saved_per_year ?? 0;
  const assist = by("assist")?.hours_saved_per_year ?? 0;
  const quadrant = `${a.flags.client_facing ? "External" : "Internal"} ${auto >= assist ? "Agents" : "RAG"}` as Quadrant;
  const t = a.totals;
  const flagNote = (["client_facing", "affects_rights", "irreversible"] as const)
    .filter((f) => a.flags[f])
    .map((f) => `${f.replace("_", " ")} (lines ${lines(a.flags.evidence[f])})`);
  const stay = by("keep_human")?.step_ids.length ?? 0;
  return {
    ext_id: `SOP-${slug(a.sop_id).toUpperCase()}`,
    entity: input.metadata.entity,
    entity_sector: input.metadata.entity_sector ?? null,
    title: input.title,
    quadrant,
    matrix_examples: null,
    departments: input.metadata.departments?.join("; ") || null,
    client_facing: a.flags.client_facing,
    affects_rights: a.flags.affects_rights,
    irreversible: a.flags.irreversible,
    hitl_rule: null,
    description:
      `Derived from the SOP "${input.title}" (${a.steps.length} steps). Against a synthetic baseline of ${t.baseline_hours_per_year} h a year, ` +
      `about ${t.hours_saved_per_year} h (${t.vs_baseline_pct}%, ${t.cost_saved_per_year} ${t.currency}) could be saved; ${stay} steps stay with people. ` +
      `${flagNote.length ? `Risk flags: ${flagNote.join("; ")}. ` : "No risk flags found. "}Fictitious figures, synthetic data.`,
  };
}
