import assert from "node:assert/strict";
import test from "node:test";
import { currentVerdict, evidenceLines, evidenceScenario, evidenceSteps, nextAdhocEventId, isEvidenceScenario, missingEvidence, scenarioFor, startEvidenceRun } from "../src/lib/un/evidence-scenario.ts";
import { acceptanceOf, effectiveGates, EMPTY_GOV } from "../src/lib/un/gates.ts";
import { adhocStep, type RunEnv, type RunState } from "../src/lib/un/scenario.ts";
import { S1 } from "../src/lib/un/scenarios.ts";
import { signRun, signatureOf, signedVerdict } from "../src/lib/un/signature.ts";
import { verifyLog } from "../src/lib/un/trace.ts";
import { loadChunksFrom } from "./helpers-un.ts";

// The verdict path of ANY use case: no staged scenario, the owners of each gate record the evidence, the ordinary round judges it, a person signs.

const facts = { client_facing: false, affects_rights: false, irreversible: false };
const eff = effectiveGates({ ext: "UC09", facts });
const env: RunEnv = { now: () => "2026-11-28T08:00:00Z", chunks: loadChunksFrom(), effective: eff, hitl: { config: {}, entity: "AGN", facts } };
const sc = evidenceScenario("UC09", false);
const fresh = (requested: "GO_SUPERVISED" | "ASSISTANT_ONLY" = "GO_SUPERVISED") => startEvidenceRun("UC09", "E-UC09-test", { clientFacing: false, requested });
const people = () => evidenceLines(eff, null).filter((l) => l.kind === "person");
const cur = (run: RunState, gate: string) => evidenceLines(eff, run).find((l) => l.id === gate)!.status;
async function record(run: RunState, gate: string, status: "pass" | "fail" | "fix_declared", note = "Checked the audit export against the SOP", change?: string) {
  const s = evidenceSteps({ gate, status, note, change }, eff, cur(run, gate), nextAdhocEventId(sc.id, run));
  assert.ok(s.ok, s.ok ? "" : s.error);
  let r = run;
  for (const input of s.inputs) r = await adhocStep(sc, r, input, env);
  return r;
}
test("a use case with no staged scenario gets an evidence scenario of its own, and the stored run finds it again by its id", () => {
  assert.equal(isEvidenceScenario("E-UC09"), true);
  assert.equal(isEvidenceScenario("S1"), false);
  assert.equal(scenarioFor("S1"), S1, "a staged scenario is still the staged one");
  const s = scenarioFor("E-UC09");
  assert.ok(s && s.kind === "gate" && s.ext_id === "UC09" && s.steps.length === 0);
  assert.equal(scenarioFor("E-"), undefined);
  assert.equal(scenarioFor("nope"), undefined);
});

test("a new evidence run has nothing staged to release: it can be signed once the evidence is in", () => {
  const run = fresh();
  assert.equal(run.done, true);
  assert.equal(run.state?.requested, "GO_SUPERVISED");
  assert.equal(run.steps.length, 0);
  assert.equal(currentVerdict(run), null);
  assert.throws(() => signRun(sc, run, { signer_id: "u", role: "admin", decision: "SIGN", comment: "" }, env.now), /no verdict to sign/, "no evidence, no verdict");
});

test("every effective gate a person owns is listed and missing until its evidence is recorded; the aim is the same list the journey accepts", async () => {
  assert.ok(people().length >= 2, "the shipped rule set gives a use case several gates");
  assert.ok(people().every((l) => l.status === "unknown"));
  let run = fresh();
  const first = people()[0].id;
  run = await record(run, first, "pass");
  const lines = evidenceLines(eff, run);
  assert.equal(lines.find((l) => l.id === first)!.status, "pass");
  assert.equal(lines.find((l) => l.id === first)!.note, "Checked the audit export against the SOP");
  assert.deepEqual(missingEvidence(lines).includes(first), false);
  assert.equal(missingEvidence(lines).length, people().length - 1);
  assert.ok(currentVerdict(run), "the round judged the evidence so far");
});

test("all gates passing and a person signing writes a verdict the use case can carry; the trace chain verifies", async () => {
  let run = fresh();
  for (const l of people()) run = await record(run, l.id, "pass");
  assert.deepEqual(missingEvidence(evidenceLines(eff, run)), []);
  const verdict = currentVerdict(run)!.verdict;
  assert.ok(["GO_SUPERVISED", "GO_AUTONOMOUS", "ASSISTANT_ONLY"].includes(verdict), verdict);
  assert.notEqual(verdict, "NO_GO");
  const signed = signRun(sc, run, { signer_id: "u-owner", role: "admin", decision: "SIGN", comment: "Evidence seen" }, env.now);
  assert.ok(verifyLog(signed.log).ok);
  assert.equal(signatureOf(signed)?.signature?.decision, "SIGN");
  assert.equal(signedVerdict(signed)?.verdict, verdict);
});

test("the journey's gates stage reads this run: accepted only when every gate has passing evidence", async () => {
  let run = fresh();
  assert.equal(acceptanceOf(eff, "UC09", run.state!.gates, EMPTY_GOV).accepted, false, "no evidence yet");
  for (const l of people().slice(1)) run = await record(run, l.id, "pass");
  assert.deepEqual(acceptanceOf(eff, "UC09", run.state!.gates, EMPTY_GOV).lacking, [people()[0].id], "one gate still has no evidence");
  run = await record(run, people()[0].id, "fail");
  assert.equal(acceptanceOf(eff, "UC09", run.state!.gates, EMPTY_GOV).accepted, false, "a failed gate is not accepted");
  run = await record(run, people()[0].id, "fix_declared", "Fixed", "CHG-1");
  assert.equal(acceptanceOf(eff, "UC09", run.state!.gates, EMPTY_GOV).accepted, false, "a declared fix is not yet accepted: it has to be re-tested");
  run = await record(run, people()[0].id, "pass", "Re-test passed");
  assert.equal(acceptanceOf(eff, "UC09", run.state!.gates, EMPTY_GOV).accepted, true);
});

test("a failed gate gives NO_GO; a declared fix with its change record holds it at ASSISTANT_ONLY; only the re-test passes it", async () => {
  let run = fresh();
  const gate = people()[0].id;
  for (const l of people().slice(1)) run = await record(run, l.id, "pass");
  run = await record(run, gate, "fail", "The audit export is missing three weeks");
  assert.equal(cur(run, gate), "fail");
  assert.equal(currentVerdict(run)!.verdict, "NO_GO");
  const before = run.steps.length;
  run = await record(run, gate, "fix_declared", "Re-exported the audit log", "Change ticket CHG-1042, export attached");
  assert.equal(run.steps.length, before + 2, "the change record, then the declaration that cites it");
  const record2 = run.steps[run.steps.length - 2].events[0], fix = run.steps[run.steps.length - 1].events[0];
  assert.equal(record2.gate, undefined);
  assert.match(record2.summary, /Change record.*CHG-1042/);
  assert.deepEqual(fix.links, [record2.id], "the declared fix cites the change record");
  assert.equal(cur(run, gate), "fix_declared", "the declaration was accepted (a bare one would be rejected and lift nothing)");
  assert.equal(currentVerdict(run)!.verdict, "ASSISTANT_ONLY");
  run = await record(run, gate, "pass", "Re-test: the export is complete");
  assert.equal(cur(run, gate), "pass");
  assert.notEqual(currentVerdict(run)!.verdict, "NO_GO");
  assert.ok(verifyLog(run.log).ok);
});

test("what is recorded is checked: a gate that does not apply, a waived or measured gate, a missing note, a bad status", () => {
  const ok = people()[0].id;
  const step = (i: { gate: string; status: string; note: string; change?: string }, current: "unknown" | "pass" | "fail" | "fix_declared" = "unknown", e = eff) => evidenceSteps(i, e, current, "E-UC09-A1-adhoc");
  assert.equal(step({ gate: "not_a_gate", status: "pass", note: "x" }).ok, false);
  assert.equal(step({ gate: ok, status: "pass", note: "  " }).ok, false);
  assert.equal(step({ gate: ok, status: "maybe", note: "x" }).ok, false);
  assert.equal(step({ gate: ok, status: "pass", note: "x".repeat(501) }).ok, false);
  const one = step({ gate: ok, status: "pass", note: "Seen" });
  assert.ok(one.ok && one.inputs.length === 1 && one.inputs[0].recipients[0] === eff.catalog[ok].owner, "the evidence goes to the gate's owner");
  const waived = effectiveGates({ ext: "UC09", facts, gov: { custom: {}, added: {}, waivers: { UC09: [{ gate: ok, approver: "Head of HR", approver_source: "", reason: "n/a", by: "a", at: "2026-11-28T00:00:00Z" }] } } });
  const w = step({ gate: ok, status: "pass", note: "x" }, "unknown", waived);
  assert.ok(!w.ok && /waived/.test(w.error));
  assert.equal(evidenceLines(waived, null).find((l) => l.id === ok)!.kind, "waived");
});

test("a failure is lifted only by a declared fix and a re-test: a bare pass is refused, a fix needs a change reference and a failing gate", () => {
  const ok = people()[0].id;
  const step = (i: { gate: string; status: string; note: string; change?: string }, current: "unknown" | "pass" | "fail" | "fix_declared") => evidenceSteps(i, eff, current, "E-UC09-A4-adhoc");
  const bare = step({ gate: ok, status: "pass", note: "Looks fine now" }, "fail");
  assert.ok(!bare.ok && /Declare the fix/.test(bare.error));
  assert.equal(step({ gate: ok, status: "fail", note: "Still failing" }, "fail").ok, true, "a gate may be recorded as failing again");
  const noChange = step({ gate: ok, status: "fix_declared", note: "Fixed" }, "fail");
  assert.ok(!noChange.ok && /change reference/.test(noChange.error));
  assert.equal(step({ gate: ok, status: "fix_declared", note: "Fixed", change: "x".repeat(301) }, "fail").ok, false);
  const notFailing = step({ gate: ok, status: "fix_declared", note: "Fixed", change: "CHG-1" }, "pass");
  assert.ok(!notFailing.ok && /only for a gate that fails/.test(notFailing.error));
  const good = step({ gate: ok, status: "fix_declared", note: "Fixed", change: "CHG-1" }, "fail");
  assert.ok(good.ok);
  if (good.ok) {
    assert.equal(good.inputs.length, 2);
    assert.deepEqual(good.inputs[1].evidence, ["E-UC09-A4-adhoc"], "the declaration cites the id the change record will get");
    assert.deepEqual(good.inputs[1].recipients, ["innovator"], "only the innovator declares a fix");
  }
  assert.equal(step({ gate: ok, status: "pass", note: "Re-test passed" }, "fix_declared").ok, true, "the re-test follows a declared fix");
});
