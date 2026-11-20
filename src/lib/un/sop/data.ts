import { readFileSync } from "node:fs";
import path from "node:path";
import { parseBaseline } from "./baseline.ts";
import { slug } from "./promote.ts";
import { analyzeSop } from "./reference.ts";
import type { SopAnalysis, SopInput, SyntheticBaseline } from "./types.ts";

// Server-only: reads the synthetic baseline and the three fixture SOPs.
const root = () => process.cwd();

export function loadBaseline(): SyntheticBaseline {
  return parseBaseline(JSON.parse(readFileSync(path.join(root(), "data", "sop-baseline.json"), "utf8")));
}

const ENTITY = "Marsa Public Services Authority";
export const SAMPLES = [
  { sop_id: "licence-renewal", file: "sop-uc02-licence-renewal.md", title: "Trade licence renewal and permit pre-check (SOP)", departments: ["Licensing"] },
  { sop_id: "records-archive", file: "sop-records-archive.md", title: "Monthly archive of internal inspection records (SOP)", departments: ["Records"] },
  { sop_id: "fee-waiver", file: "sop-fee-waiver-decision.md", title: "Late-fee waiver and penalty decision (SOP)", departments: ["Licensing", "Finance"] },
] as const;

export function sampleInput(sop_id: string, baseline = loadBaseline()): SopInput | null {
  const s = SAMPLES.find((x) => x.sop_id === sop_id);
  if (!s) return null;
  return {
    sop_id: s.sop_id, title: s.title, baseline,
    text: readFileSync(path.join(root(), "data", "sop", s.file), "utf8"),
    metadata: { entity: ENTITY, entity_sector: "Public services", departments: [...s.departments] },
  };
}

export const MAX_SOP_BYTES = 200_000;

/** Validates an API body (a sample id, or pasted text) into an analyzer input; string = error. */
export function inputFromBody(body: unknown): SopInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.sample === "string") return sampleInput(b.sample) ?? "Unknown sample";
  const text = typeof b.text === "string" ? b.text : "";
  if (!text.trim()) return "The SOP text is empty.";
  if (text.length > MAX_SOP_BYTES) return "The SOP is too large (200 KB limit).";
  const title = (typeof b.title === "string" && b.title.trim()) || text.match(/^#\s+(.+)$/m)?.[1]?.trim() || "Uploaded SOP";
  const sop_id = slug(String(b.sop_id ?? title)) || "uploaded";
  const entity = (typeof b.entity === "string" && b.entity.trim()) || ENTITY;
  return { sop_id, title: title.slice(0, 120), text, baseline: loadBaseline(), metadata: { entity, entity_sector: "Public services" } };
}

/** Precomputed, read-only samples for the viewer/judge role. Pure function of the fixtures. */
export function loadSamples(): { input: SopInput; analysis: SopAnalysis }[] {
  const baseline = loadBaseline();
  return SAMPLES.map((s) => {
    const input = sampleInput(s.sop_id, baseline)!;
    return { input, analysis: analyzeSop(input) };
  });
}
