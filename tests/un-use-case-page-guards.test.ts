import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Source guards for the use-case page: facts about wiring that a unit test of a pure function cannot see.
const src = (f: string) => readFileSync(f, "utf8");
const D = "src/app/admin/federal/use-cases/[id]/";

test("the shared header does not print the simulated attestation's compliance flag unlabelled", () => {
  assert.ok(!/uc\.sj\.(not)?compliant/.test(src(D + "UseCaseHeader.tsx")));
});

test("the overview labels the compliance flag as the simulated attestation", () => {
  const page = src(D + "page.tsx");
  assert.ok(page.includes("ucsum.sim.att") && /uc\.sj\.compliant/.test(page));
});

test("the stage strip falls back to English state names, never to the raw state code", () => {
  const strip = src(D + "StageStrip.tsx");
  assert.ok(strip.includes("STATE_EN[s.state]") && !/`jb\.state\.\$\{s\.state\}`, s\.state\)/.test(strip));
});

test("the release gate is worked out once per request: the journey loader uses the cached loader", () => {
  const j = src("src/lib/un/journey-store.ts");
  assert.ok(j.includes("loadReleaseCached") && !/\bloadRelease\(/.test(j));
});
