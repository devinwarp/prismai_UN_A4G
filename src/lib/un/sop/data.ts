import { readFileSync } from "node:fs";
import { retrievablePart } from "../sop-kb.ts";
import path from "node:path";
import { parseBaseline } from "./baseline.ts";
import { slug } from "./promote.ts";
import { deriveProfiles, type JobProfile } from "./profiles.ts";
import { analyzeSop } from "./reference.ts";
import type { SopAnalysis, SopInput, SyntheticBaseline } from "./types.ts";

// Server-only: reads the synthetic baseline and the three fixture SOPs.
// One SOP per use case: UC02 attaches to SOP-LIC-014. The older licence-renewal sample was removed from this list
// (it described the same process); its text lives on as an analyzer test fixture in tests/fixtures/sop/.
const root = () => process.cwd();

export function loadBaseline(currency?: string | null): SyntheticBaseline {
  const baseline = parseBaseline(JSON.parse(readFileSync(path.join(root(), "data", "sop-baseline.json"), "utf8")));
  return currency === undefined ? baseline : { ...baseline, currency };
}

const ENTITY = "Marsa Public Services Authority";
export const SAMPLES = [
  // Shaibi's SOP for UC02 (also the agent runtime's SOP): the one SOP UC02 attaches to, and the default on the intake page.
  { sop_id: "SOP-LIC-014", file: "sops/uc02-trade-licence-renewal-sop.md", title: "Trade licence renewal (SOP-LIC-014)", departments: ["Licensing"] },
  { sop_id: "records-archive", file: "sop/sop-records-archive.md", title: "Monthly archive of internal inspection records (SOP)", departments: ["Records"] },
  { sop_id: "fee-waiver", file: "sop/sop-fee-waiver-decision.md", title: "Late-fee waiver and penalty decision (SOP)", departments: ["Licensing", "Finance"] },
] as const;

/** The shipped procedure for Marsa's trade licence use case, even before it is attached. */
export function sampleSopIdForUseCase({ ext_id, entity }: { ext_id: string; entity: string }): string | null {
  return ext_id === "UC02" && entity.trim().toLowerCase() === ENTITY.toLowerCase() ? SAMPLES[0].sop_id : null;
}

export function sampleInput(sop_id: string, baseline = loadBaseline(), shared = false): SopInput | null {
  const s = SAMPLES.find((x) => x.sop_id === sop_id);
  if (!s || (shared && s.sop_id === "SOP-LIC-014")) return null;
  const text = retrievablePart(readFileSync(path.join(root(), "data", s.file), "utf8"));
  return {
    sop_id: s.sop_id, title: s.title, baseline,
    // The Annex of SOP-LIC-014 is an answer key for testing an analyzer, so the analyzer never reads it.
    text: shared ? text.replaceAll(ENTITY, "Sample public services authority").replaceAll("Marsa ", "") : text,
    metadata: { entity: shared ? "Sample public services authority" : ENTITY, entity_sector: "Public services", departments: [...s.departments] },
  };
}

export const MAX_SOP_BYTES = 200_000;

/** Validates an API body (a sample id, or pasted text) into an analyzer input; string = error. */
export function inputFromBody(body: unknown, currency?: string | null, shared = false): SopInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.sample === "string") return sampleInput(b.sample, loadBaseline(currency), shared) ?? "Unknown sample";
  const text = typeof b.text === "string" ? b.text : "";
  if (!text.trim()) return "The SOP text is empty.";
  if (text.length > MAX_SOP_BYTES) return "The SOP is too large (200 KB limit).";
  const title = (typeof b.title === "string" && b.title.trim()) || text.match(/^#\s+(.+)$/m)?.[1]?.trim() || "Uploaded SOP";
  const sop_id = slug(String(b.sop_id ?? title)) || "uploaded";
  const entity = (typeof b.entity === "string" && b.entity.trim()) || ENTITY;
  return { sop_id, title: title.slice(0, 120), text, baseline: loadBaseline(currency), metadata: { entity, entity_sector: "Public services" } };
}

/** Precomputed, read-only samples for the viewer/judge role. Pure function of the fixtures. */
export function loadSamples(currency?: string | null, shared = false): { input: SopInput; analysis: SopAnalysis }[] {
  const baseline = loadBaseline(currency);
  return SAMPLES.flatMap((s) => {
    const input = sampleInput(s.sop_id, baseline, shared);
    return input ? [{ input, analysis: analyzeSop(input) }] : [];
  });
}

/** Job profiles of a sample SOP (null when the id is not a sample). */
export function profilesOf(sop_id: string): JobProfile[] | null {
  const input = sampleInput(sop_id);
  return input ? deriveProfiles(analyzeSop(input), input.text) : null;
}
