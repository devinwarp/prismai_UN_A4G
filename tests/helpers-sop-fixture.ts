import { readFileSync } from "node:fs";
import { loadBaseline } from "../src/lib/un/sop/data.ts";
import { analyzeSop } from "../src/lib/un/sop/reference.ts";
import type { SopAnalysis, SopInput } from "../src/lib/un/sop/types.ts";

// The older licence-renewal sample is no longer offered by the product (UC02 has one SOP, SOP-LIC-014), but the
// analyzer's regression tests were written against its text, so it stays as a test-only fixture.
export const LEGACY_LICENCE_RENEWAL = "tests/fixtures/sop/analyzer-licence-renewal.md";

export function legacyLicenceRenewal(): { input: SopInput; analysis: SopAnalysis } {
  const input: SopInput = {
    sop_id: "licence-renewal",
    title: "Trade licence renewal and permit pre-check (SOP)",
    baseline: loadBaseline(),
    text: readFileSync(LEGACY_LICENCE_RENEWAL, "utf8"),
    metadata: { entity: "Marsa Public Services Authority", entity_sector: "Public services", departments: ["Licensing"] },
  };
  return { input, analysis: analyzeSop(input) };
}
