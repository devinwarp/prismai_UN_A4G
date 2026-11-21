import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AR } from "../src/lib/un/i18n/dict.ts";
import { parseUseCases } from "../src/lib/un/model.ts";
import { isSandboxOutcome, SANDBOX_KEY } from "../src/lib/un/sandbox.ts";
import { S3 } from "../src/lib/un/scenarios.ts";

const ucs = parseUseCases(readFileSync("data/un-use-cases.csv", "utf8")).useCases;
const by = (id: string) => ucs.find((u) => u.ext_id === id)!;

test("rights-affecting and irreversible flags are data columns on every bundled row", () => {
  for (const u of ucs) assert.equal(typeof u.affects_rights, "boolean", `${u.ext_id} affects_rights`);
  for (const u of ucs) assert.equal(typeof u.irreversible, "boolean", `${u.ext_id} irreversible`);
  assert.deepEqual(ucs.filter((u) => u.affects_rights).map((u) => u.ext_id), ["UC09", "UC11", "UC13", "UC17"]);
  assert.deepEqual(ucs.filter((u) => u.irreversible).map((u) => u.ext_id), ["UC03", "UC06"]);
});

test("the compare page reads the column first; the old default list is only a fallback", () => {
  const src = readFileSync("src/app/admin/federal/compare/page.tsx", "utf8");
  assert.match(src, /u\.affects_rights \?\? FALLBACK_RIGHTS/);
  assert.doesNotMatch(src, /rightsSet\.has\(u\.ext_id\) \|\| u\.affects_rights/);
  // an old CSV without the column leaves the flag undefined, which is what triggers the fallback
  assert.equal(parseUseCases("id,entity,use_case,quadrant\nUC09,E,T,Internal Agents\n").useCases[0].affects_rights, undefined);
  assert.equal(by("UC09").affects_rights, true);
});

test("sandbox figures are labelled everywhere they appear, with an Arabic key", () => {
  assert.ok(AR[SANDBOX_KEY]);
  assert.ok(isSandboxOutcome(S3.steps[1].expected));
  assert.ok(!isSandboxOutcome("NO_GO"));
  for (const f of ["src/app/admin/federal/runs/[id]/RunView.tsx", "src/app/replay/page.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /SANDBOX_(KEY|EN)/, f);
  }
  assert.match(readFileSync("src/app/admin/federal/scenarios/page.tsx", "utf8"), /not the live register/);
});
