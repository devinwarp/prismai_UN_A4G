import assert from "node:assert/strict";
import test from "node:test";
import { nextStep, startRun, type RunEnv, type RunState } from "../src/lib/un/scenario.ts";
import { S1, S3 } from "../src/lib/un/scenarios.ts";
import { signRun, signatureOf, signedVerdict } from "../src/lib/un/signature.ts";
import { verifyLog } from "../src/lib/un/trace.ts";
import { loadChunksFrom } from "./helpers-un.ts";

const env: RunEnv = { now: () => "2026-11-09T08:00:00Z", chunks: loadChunksFrom() };
const done = async () => { let r: RunState = startRun(S1, "r"); while (!r.done) r = await nextStep(S1, r, env); return r; };
const who = { signer_id: "u-officer", role: "compliance officer", decision: "SIGN" as const, comment: "Re-tests seen" };

test("I-4: the signature is the final hash-chained record and the chain still verifies", async () => {
  const signed = signRun(S1, await done(), who, env.now);
  const last = signed.log[signed.log.length - 1];
  assert.equal(last.signature?.type, "HUMAN_SIGNATURE");
  assert.equal(last.signature?.signer_id, "u-officer");
  assert.equal(last.proposal, "GO_SUPERVISED");
  assert.ok(verifyLog(signed.log).ok);
  assert.equal(signatureOf(signed), last);
});

test("I-4: no verdict is releasable before a SIGN; WITHHOLD never releases one", async () => {
  const run = await done();
  assert.equal(signedVerdict(run), null);
  const withheld = signRun(S1, run, { ...who, decision: "WITHHOLD", comment: "Evidence thin" }, env.now);
  assert.equal(signedVerdict(withheld), null);
  const signed = signRun(S1, run, who, env.now);
  assert.equal(signedVerdict(signed)?.verdict, "GO_SUPERVISED");
});

test("I-4: only a completed run can be signed, once, with a signer", async () => {
  assert.throws(() => signRun(S1, startRun(S1, "r"), who, env.now), /release every step/);
  const run = await done();
  const signed = signRun(S1, run, who, env.now);
  assert.throws(() => signRun(S1, signed, who, env.now), /already/);
  assert.throws(() => signRun(S1, run, { ...who, signer_id: "" }, env.now), /signer/);
  assert.throws(() => signRun(S1, run, { ...who, decision: "WITHHOLD", comment: " " }, env.now), /comment/);
  assert.throws(() => signRun(S3, run, who, env.now), /gate/);
});

test("I-4: a tampered signature breaks the chain", async () => {
  const signed = signRun(S1, await done(), who, env.now);
  const log = signed.log.map((r, i) => (i === signed.log.length - 1 ? { ...r, signature: { ...r.signature!, signer_id: "someone-else" } } : r));
  assert.equal(verifyLog(log).ok, false);
});

test("I-1 / I-4: a SIGN yields the one update that gives the use case its verdict; a WITHHOLD or an unsigned run writes nothing", async () => {
  const { verdictWriteFor } = await import("../src/lib/un/signature.ts");
  const run = await done();
  assert.equal(verdictWriteFor("run-uuid", run, true), null); // not signed yet
  const withheld = signRun(S1, run, { ...who, decision: "WITHHOLD", comment: "Evidence thin" }, env.now);
  assert.equal(verdictWriteFor("run-uuid", withheld, true), null);
  const signed = signRun(S1, run, who, env.now);
  const patch = verdictWriteFor("run-uuid", signed, true)!;
  assert.equal(patch.verdict, "GO_SUPERVISED");
  assert.equal(patch.verdict_run_id, "run-uuid");
  assert.equal(patch.verdict_signed_by, "u-officer");
  // the head hash is the signature record's hash: what un_runs.head_hash holds once the signed state is saved
  assert.equal(patch.verdict_head_hash, signed.log[signed.log.length - 1].hash);
});

test("I-1 / I-4: after a SIGN the dashboard counts the use case as deployed, so the verdict lock does not leave it at zero", async () => {
  const { verdictWriteFor } = await import("../src/lib/un/signature.ts");
  const { engineValues } = await import("../src/lib/un/guard.ts");
  const { computeDashboard, DEFAULT_POLICY } = await import("../src/lib/un/model.ts");
  const uc = { id: "1", ext_id: "UC02", entity: "E", entity_sector: null, title: "t", quadrant: "External Agents" as const, matrix_examples: null, departments: null, client_facing: true, hitl_rule: null, description: null, stage: "pilot" as const, verdict: null, compliant: false };
  assert.equal(computeDashboard(DEFAULT_POLICY, [engineValues(uc)]).deployed, 0); // nothing signed yet
  const patch = verdictWriteFor("run-uuid", signRun(S1, await done(), who, env.now), true)!;
  const after = engineValues({ ...uc, ...patch } as typeof uc);
  assert.equal(after.verdict, "GO_SUPERVISED");
  assert.equal(computeDashboard(DEFAULT_POLICY, [after]).deployed, 1);
});

test("I-4: the sign route and the Sign / Withhold button exist and are wired to the guarded pieces", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync("src/app/api/admin/un/runs/[id]/sign/route.ts", "utf8");
  for (const s of ["requireAdmin", "signRun(", "writeSignedVerdict", "storeTraceRows", 'sc.kind !== "gate"', "eq(\"updated_at\", row.updated_at)"]) assert.ok(route.includes(s), s);
  const view = readFileSync("src/app/admin/federal/runs/[id]/RunView.tsx", "utf8");
  for (const s of ['sign("SIGN")', 'sign("WITHHOLD")', "/sign`", "isGate && state.done"]) assert.ok(view.includes(s), s);
  assert.ok(readFileSync("src/app/admin/federal/runs/[id]/page.tsx", "utf8").includes('isGate={sc.kind === "gate"}'));
});
