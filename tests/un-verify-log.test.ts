import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { nextStep, startRun, type RunEnv, type RunState } from "../src/lib/un/scenario.ts";
import { S1 } from "../src/lib/un/scenarios.ts";
import { signRun } from "../src/lib/un/signature.ts";
import { verifyExport } from "../scripts/verify_log.ts";
import { loadChunksFrom } from "./helpers-un.ts";

const env: RunEnv = { now: () => "2026-11-09T08:00:00Z", chunks: loadChunksFrom() };
const signed = async () => {
  let r: RunState = startRun(S1, "r");
  while (!r.done) r = await nextStep(S1, r, env);
  return signRun(S1, r, { signer_id: "u-officer", role: "compliance officer", decision: "SIGN", comment: "ok" }, env.now);
};
const cli = (doc: unknown) => {
  const f = join(mkdtempSync(join(tmpdir(), "vl-")), "run.json");
  writeFileSync(f, JSON.stringify(doc));
  return spawnSync(process.execPath, ["scripts/verify_log.ts", f], { encoding: "utf8" });
};

test("C4-4: a clean export verifies, in every accepted shape, and reports the signature", async () => {
  const run = await signed();
  const head = run.log[run.log.length - 1].hash;
  for (const doc of [run, { state: run, head_hash: head }, { records: run.log }, run.log]) assert.ok(verifyExport(doc).ok);
  assert.match(verifyExport(run).lines.join("\n"), /human SIGN by u-officer/);
});

test("C4-4: an edited record is named, a cut tail is caught against the stored head", async () => {
  const run = await signed();
  const forged = structuredClone(run);
  forged.log[3].claims[0].text = "changed";
  const r = verifyExport(forged);
  assert.equal(r.ok, false);
  assert.match(r.lines[0], /BROKEN at record 4 \(tr_000004\)/);
  const head = run.log[run.log.length - 1].hash;
  const cut = { state: { ...run, log: run.log.slice(0, -2) }, head_hash: head };
  assert.match(verifyExport(cut).lines[0], /truncated or extended/);
  assert.equal(verifyExport({ nothing: 1 }).ok, false);
});

test("C4-4: the script runs offline from the command line: exit 0 on OK, 1 on the first broken record", async () => {
  const run = await signed();
  const good = cli(run);
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /^OK: \d+ records/);
  const bad = structuredClone(run);
  bad.log[1].step = "T9";
  const res = cli(bad);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /BROKEN at record 2/);
});
