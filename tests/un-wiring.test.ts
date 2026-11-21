import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { acceptanceOf, appendGov, decideEffective, effectiveGates, replayGov, type GovEntry } from "../src/lib/un/gates.ts";
import { compareProcesses } from "../src/lib/un/compare.ts";
import { journeyStatus, type JourneyInput } from "../src/lib/un/journey.ts";
import { UAE_FEDERAL } from "../src/lib/un/rulesets.ts";
import { assessProfiles, mostRestrictive } from "../src/lib/un/sop/profiles.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { GATES, type GateState } from "../src/lib/un/policy.ts";

const NOW = "2026-11-21T10:00:00Z";
const def = { label: "Median response time stays under the agreed limit", owner: "security", category: "non-functional", evidence: "reviewer" };
const log = (...es: [GovEntry["kind"], Record<string, unknown>][]) => {
  const out: GovEntry[] = [];
  for (const [k, p] of es) out.push(appendGov(out[out.length - 1] ?? null, k, "admin@example.invalid", p, NOW));
  return out;
};
const facts = { client_facing: true, affects_rights: false, irreversible: false };
const allPass: GateState = Object.fromEntries(Object.keys(GATES).map((g) => [g, "pass"]));
const added = log(["gate_added", { gate: "latency_p50", def, signed_off_by: "a" }], ["use_case_gate", { ext_id: "UC02", gate: "latency_p50", reason: "r", source: "requirement" }]);
const accept = (gov: ReturnType<typeof replayGov>, gates: GateState, f = facts) => acceptanceOf(effectiveGates({ ext: "UC02", facts: f, gov }), "UC02", gates, gov);

const sop = { attached: true, profiles: 4, ticked: 2, kbOk: true, skills: 2 };
const stage2 = (accepted: boolean | null, s = sop) => {
  const i: JourneyInput = { sop: s, gates: accepted === null ? null : { accepted }, verdict: null, evalSet: true, evalRuns: 0, evalMet: null, tuning: [], watch: [] };
  const g = journeyStatus(i).stages[1];
  return [g.state, g.reason];
};

test("stage 2 states from the real effective gates: needs you on missing evidence, on a failed gate, on an unsigned waiver or gate; done when all settle", () => {
  const none = replayGov([]);
  assert.equal(accept(none, {}).accepted, false); // no evidence yet
  assert.equal(accept(none, allPass).accepted, true);
  assert.deepEqual(accept(none, { ...allPass, audit_log: "fail" }).lacking, ["audit_log"]);
  assert.equal(accept(none, { ...allPass, data_lawful: "fix_declared" }).accepted, false);
  // an added gate with no evidence lacks acceptance; a passing one settles it
  const gov = replayGov(added);
  assert.deepEqual(accept(gov, allPass).lacking, ["latency_p50"]);
  assert.equal(accept(gov, { ...allPass, latency_p50: "pass" }).accepted, true);
  // a signed waiver settles a failing gate; an unsigned waiver, or an unsigned admin gate, awaits sign-off
  const waived = replayGov([...added, appendGov(added[1], "waiver", "a", { ext_id: "UC02", gate: "latency_p50", approver: "Head of Security", reason: "r" }, NOW)]);
  assert.equal(accept(waived, allPass).accepted, true);
  const unsignedWaiver = replayGov([...added, appendGov(added[1], "waiver", "a", { ext_id: "UC02", gate: "latency_p50", approver: "", reason: "r" }, NOW)]);
  assert.deepEqual(accept(unsignedWaiver, allPass), { accepted: false, lacking: [], unsigned: ["latency_p50"] });
  const unsignedGate = replayGov(log(["gate_added", { gate: "latency_p50", def, signed_off_by: "" }], ["use_case_gate", { ext_id: "UC02", gate: "latency_p50", reason: "r", source: "admin" }]));
  assert.deepEqual(accept(unsignedGate, { ...allPass, latency_p50: "pass" }).unsigned, ["latency_p50"]);
  // the journey bar reads exactly that
  assert.deepEqual(stage2(accept(none, {}).accepted), ["needs_you", "accept_gates"]);
  assert.deepEqual(stage2(accept(none, allPass).accepted), ["done", null]);
  assert.deepEqual(stage2(null), ["not_yet", "gates_unbuilt"]);
  assert.deepEqual(stage2(true, { ...sop, ticked: 0, skills: 0 }), ["not_yet", "after_sop"]);
});

test("a flag widens the effective gates: rights flag adds the admin gate that requires it", () => {
  const gov = replayGov(log(["gate_added", { gate: "rights_review", def: { ...def, category: "functional", requires: ["affects_rights"], rulesets: ["uae-federal"] }, signed_off_by: "a" }]));
  assert.equal(accept(gov, allPass).accepted, true);
  assert.deepEqual(accept(gov, allPass, { ...facts, affects_rights: true }).lacking, ["rights_review"]);
});

test("chain: SOP -> ticked profiles -> flags -> effective gates -> verdict -> journey stage", () => {
  const gov = replayGov(added);
  const profiles = profilesOf("SOP-LIC-014")!;
  const ticked = new Set([profiles[0].name, profiles[1].name]);
  const a = assessProfiles(profiles, ticked, UAE_FEDERAL, "uae", { ext: "UC02", gov });
  // 1. roll-up is the most restrictive ticked verdict, and the added gate is in every profile's effective set
  const on = a.rows.filter((r) => r.automate);
  assert.equal(a.rollup!.all_pass, mostRestrictive(on.map((r) => r.verdicts.all_pass)));
  assert.equal(on.length, 2);
  // 2. the same row through the plain path is NOT looser: an added gate never lowers a verdict
  const plain = assessProfiles(profiles, ticked, UAE_FEDERAL, "uae");
  assert.ok(on.every((r, i) => r.gates === plain.rows.filter((x) => x.automate)[i].gates + 1));
  // 3. roll-up flags -> use case flags -> the same decideEffective() the run uses
  const f = { client_facing: on.some((r) => r.flags.client_facing), affects_rights: on.some((r) => r.flags.affects_rights), irreversible: on.some((r) => r.flags.irreversible) };
  const d = decideEffective({ ext: "UC02", facts: f, requested: "GO_AUTONOMOUS", gates: { ...allPass, latency_p50: "pass" }, gov });
  assert.ok(["GO_SUPERVISED", "GO_AUTONOMOUS"].includes(d.decision.verdict));
  // 4. stage 2 follows the evidence on those flags
  assert.equal(accept(gov, { ...allPass }, f).accepted, false);
  assert.equal(accept(gov, { ...allPass, latency_p50: "pass" }, f).accepted, true);
  assert.deepEqual(stage2(accept(gov, allPass, f).accepted), ["needs_you", "accept_gates"]);
  assert.deepEqual(stage2(accept(gov, { ...allPass, latency_p50: "pass" }, f).accepted), ["done", null]);
});

test("the SOP page evidence cases honour the use case's waivers and added gates", () => {
  const profiles = profilesOf("SOP-LIC-014")!;
  const t = new Set([profiles[0].name]);
  const gov = replayGov(added);
  const noEv = assessProfiles(profiles, t, UAE_FEDERAL, "uae", { ext: "UC02", gov }).rows[0].verdicts;
  assert.equal(noEv.no_evidence, "ESCALATE");
  const w = replayGov([...added, appendGov(added[1], "waiver", "a", { ext_id: "UC02", gate: "audit_log", approver: "H", reason: "r" }, NOW)]);
  const rw = assessProfiles(profiles, t, UAE_FEDERAL, "uae", { ext: "UC02", gov: w }).rows[0];
  assert.equal(rw.gates, assessProfiles(profiles, t, UAE_FEDERAL, "uae", { ext: "UC02", gov }).rows[0].gates - 1);
});

test("compare uses the same path: added gates count, waived gates drop out of required and of the verdict", () => {
  const gov = replayGov([...added, appendGov(added[1], "waiver", "a", { ext_id: "UC02", gate: "audit_log", approver: "H", reason: "r" }, NOW)]);
  const eff = effectiveGates({ ext: "UC02", facts, gov });
  const pass = Object.fromEntries(Object.keys(GATES).filter((g) => g !== "audit_log").map((g) => [g, "pass"])) as GateState;
  const mk = (waived: string[]) => compareProcesses(UAE_FEDERAL, [{ id: "UC02", entity: "uae", facts, requested: "GO_SUPERVISED", gates: { ...pass, latency_p50: "pass" }, hitlUnmet: [], useCaseGates: eff.added, waived, catalog: eff.catalog }])[0];
  assert.equal(mk(eff.waived).gatesAdded, 1);
  assert.ok(!mk(eff.waived).required.includes("audit_log"));
  assert.equal(mk(eff.waived).decision.verdict, "GO_SUPERVISED");
  assert.equal(mk([]).decision.verdict, "ESCALATE"); // without the waiver the audit gate has no evidence
  assert.equal(mk(eff.waived).decision.verdict, decideEffective({ ext: "UC02", facts, requested: "GO_SUPERVISED", gates: { ...pass, latency_p50: "pass" }, gov }).decision.verdict);
});

test("approval route blocks on every effective gate, not only added ones", () => {
  const src = readFileSync("src/app/api/admin/un/use-cases/[id]/tuning/approve/route.ts", "utf8");
  assert.ok(!/eff\.added\.length/.test(src));
  assert.match(src, /approvalBlockers\(eff, evidenceFor/);
});
