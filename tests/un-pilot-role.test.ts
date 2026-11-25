import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generatedCases, planPilot } from "../src/lib/un/pilot-run.ts";
import { loadSop } from "../src/lib/un/sop-kb.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { deriveTests } from "../src/lib/un/test-derive.ts";
import { ALL_CASES, SOP_ID } from "../src/lib/un/task-evals.ts";
import { ROLE_OF_PROFILE } from "../src/lib/un/testgen.ts";

// The pilot route used to run every profile as the Document Verification Analyst. These tests pin the role binding.

const profiles = profilesOf(SOP_ID)!;
const flags = Object.fromEntries(profiles.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }])));
const setOf = (profile: string) => deriveTests({ sopId: SOP_ID, profile, chunks: loadSop(SOP_ID).chunks, flags });
const DV = "Document Verification Analyst";
const FEE = "Fee and Payment Officer";
const plan = (profile: string) => {
  const set = setOf(profile);
  const role = ROLE_OF_PROFILE[profile];
  const gen = generatedCases(set, ALL_CASES, role);
  return { gen, plan: planPilot(set, [...ALL_CASES, ...gen], role) };
};

test("Fee profile: authority probes are bound to the fp role, never dv", () => {
  const { gen, plan: p } = plan(FEE);
  const authority = Object.entries(p.bound).filter(([id]) => id.startsWith("auth."));
  assert.ok(authority.length > 0);
  assert.ok(gen.some((c) => c.id.startsWith("auth-gen-fp-")), "the generated probes are fp ones");
  assert.ok(!gen.some((c) => c.id.includes("-dv-")), "no dv probe is generated for the Fee profile");
  assert.ok(authority.every(([, ids]) => ids.every((i) => !i.includes("-dv-"))), JSON.stringify(authority));
  assert.ok(!JSON.stringify(p).includes("auth-gen-dv-"), "the stored plan of a Fee pilot has no generated dv probe");
  assert.ok(Object.values(p.bound).flat().some((i) => i.includes("-fp-")));
});

test("Document Verification Analyst: generated cases, plan and test ids are unchanged (golden hash from the code before the fix)", () => {
  const { gen, plan: p } = plan(DV);
  const ids = gen.map((c) => c.id);
  assert.ok(ids.every((i) => !i.includes("-fp-")));
  // the explicit role gives exactly what the old default (dv) gave
  const set = setOf(DV);
  assert.deepEqual(generatedCases(set, ALL_CASES).map((c) => c.id), ids);
  assert.deepEqual(planPilot(set, [...ALL_CASES, ...generatedCases(set, ALL_CASES)]), p);
  const h = createHash("sha256").update(JSON.stringify({ ids, bound: p.bound, unexecuted: p.unexecuted, aggregate: p.aggregate })).digest("hex");
  assert.equal(h, GOLDEN_DV);
});

test("every job profile of the SOP has a role, so the route refuses nothing that works today", () => {
  for (const p of profiles) assert.ok(Object.hasOwn(ROLE_OF_PROFILE, p.name), p.name);
});

test("the pilot route derives the role from the profile, passes it to both calls and refuses a profile with no role (source-text guard)", () => {
  const src = readFileSync("src/app/api/admin/un/use-cases/[id]/pilot/route.ts", "utf8");
  assert.match(src, /import \{ ROLE_OF_PROFILE \} from "@\/lib\/un\/testgen"/);
  assert.match(src, /!Object\.hasOwn\(ROLE_OF_PROFILE, profile\)\) return NextResponse\.json\(\{ error: [^\n]*status: 422/);
  assert.match(src, /const role = ROLE_OF_PROFILE\[profile\]/);
  assert.match(src, /generatedCases\(tset\.blueprints, ALL_CASES, role(, [^)]*)?\)/);
  assert.match(src, /executePilot\([^\n]*, role(, only)?(, seal)?\)/);
  assert.ok(src.indexOf("hasOwn(ROLE_OF_PROFILE") < src.indexOf("loadTestLog("), "refused before any state is read");
});

const GOLDEN_DV = "5c3924a6d355d0c2f88fdf92f42b58d48356631dc8649ce1d525ce0865feb9b7";
