import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { approvalBlockers, appendGov, decideEffective, effectiveGates, evidenceFor, replayGov, traceGates, verifyGov, affectedUseCases, EMPTY_GOV, type GovEntry } from "../src/lib/un/gates.ts";
import { EVIDENCE_SOURCES, metricStatus, parseGateDef, parseGovernance, simulatedMetric } from "../src/lib/un/governance.ts";
import { decide, GATES } from "../src/lib/un/policy.ts";
import { EU_AI_ACT, RULESETS, SG_IMDA, UAE_FEDERAL } from "../src/lib/un/rulesets.ts";
import { nextStep, startRun, type RunEnv, type RunState } from "../src/lib/un/scenario.ts";
import { S1 } from "../src/lib/un/scenarios.ts";
import { replayVerdicts, verifyLog } from "../src/lib/un/trace.ts";
import { AR } from "../src/lib/un/i18n/dict.ts";
import { loadChunksFrom } from "./helpers-un.ts";

const NOW = "2026-11-21T10:00:00Z";
const facts = { client_facing: true, affects_rights: false, irreversible: false };
const def = { label: "Median response time stays under the agreed limit", owner: "security", category: "non-functional", evidence: "reviewer" };
const log = (...es: [GovEntry["kind"], Record<string, unknown>][]) => {
  const out: GovEntry[] = [];
  for (const [k, p] of es) out.push(appendGov(out[out.length - 1] ?? null, k, "admin@example.invalid", p, NOW));
  return out;
};

test("the shipped gates and rule sets come from the seed file and keep their order and content", () => {
  const seed = JSON.parse(readFileSync("data/un-governance.json", "utf8"));
  assert.deepEqual(Object.keys(GATES), Object.keys(seed.gates));
  assert.equal(Object.keys(GATES).length, 9);
  assert.deepEqual(UAE_FEDERAL.gates, ["approved_infrastructure", "audit_log", "data_lawful", "human_final_approval", "ai_disclosure"]);
  assert.deepEqual(RULESETS.map((r) => r.id), ["uae-federal", "eu-ai-act", "sg-imda"]);
  assert.equal(EU_AI_ACT.highRisk!.applies({ client_facing: false, affects_rights: true, irreversible: false }), true);
  assert.equal(SG_IMDA.hitlDefaults.length, 2);
  assert.ok(Object.values(GATES).every((g) => ["functional", "non-functional"].includes(g.category)));
});

test("a malformed seed does not load", () => {
  const seed = JSON.parse(readFileSync("data/un-governance.json", "utf8"));
  assert.throws(() => parseGovernance({ ...seed, rulesets: [{ ...seed.rulesets[0], gates: ["nope"] }] }), /unknown gate/);
  assert.throws(() => parseGovernance({ ...seed, gates: { ...seed.gates, x: { label: "x" } } }), /gate id|owner|bad/i);
});

test("an admin-supplied gate definition is validated", () => {
  assert.ok(parseGateDef({ ...def }, { custom: true }).ok);
  for (const bad of [{ ...def, owner: "coordinator" }, { ...def, category: "other" }, { ...def, evidence: "magic" }, { ...def, requires: ["big"] }, { ...def, rulesets: ["mars"] }, { ...def, label: "" }, { ...def, metric: { name: "a" } }, { ...def, evidence: "metric" }]) {
    assert.equal(parseGateDef(bad, { custom: true }).ok, false, JSON.stringify(bad));
  }
  const r = parseGateDef({ ...def, requires: ["client_facing"] }, { custom: true });
  assert.ok(r.ok && r.def.optional && r.def.clientFacingOnly && r.def.custom);
});

test("no added gates: decide() and the effective path agree on every rule set, with the same reasons", () => {
  for (const rs of [undefined, ...RULESETS]) {
    for (const gates of [{}, { audit_log: "fail" }, { approved_infrastructure: "pass", audit_log: "pass", data_lawful: "pass", human_final_approval: "pass", ai_disclosure: "pass" }] as const) {
      const a = decide({ clientFacing: true, requested: "GO_AUTONOMOUS", gates, ruleset: rs });
      const b = decideEffective({ ext: "UC02", facts, requested: "GO_AUTONOMOUS", gates, ruleset: rs }).decision;
      if (rs) assert.deepEqual(b, a);
      else assert.deepEqual(b, decide({ clientFacing: true, requested: "GO_AUTONOMOUS", gates, ruleset: UAE_FEDERAL }));
    }
  }
  const e = effectiveGates({ ext: "UC02", facts });
  assert.deepEqual(e.added, []);
  assert.ok(e.gates.every((g) => g.source === "ruleset"));
});

test("a use case adds a gate: no evidence escalates, a fail is NO_GO, a pass restores the verdict; add-only", () => {
  const gov = replayGov(log(["gate_added", { gate: "latency_p50", def, signed_off_by: "a" }], ["use_case_gate", { ext_id: "UC02", gate: "latency_p50", reason: "Citizens wait on screen", source: "requirement" }]));
  const pass = { approved_infrastructure: "pass", audit_log: "pass", data_lawful: "pass", human_final_approval: "pass", ai_disclosure: "pass" } as const;
  const run = (g: object, ext = "UC02") => decideEffective({ ext, facts, requested: "GO_AUTONOMOUS", gates: { ...pass, ...g }, gov });
  assert.equal(run({}).decision.verdict, "ESCALATE");
  assert.match(run({}).decision.reasons.join(" "), /Median response time/);
  assert.equal(run({ latency_p50: "fail" }).decision.verdict, "NO_GO");
  assert.equal(run({ latency_p50: "pass" }).decision.verdict, "GO_SUPERVISED");
  // another use case is untouched: evidence and gates are per use case
  assert.equal(run({}, "UC03").decision.verdict, "GO_SUPERVISED");
  assert.deepEqual(run({}).effective.added, ["latency_p50"]);
  // a use case cannot drop a rule-set gate by adding it again or by any entry
  const again = replayGov(log(["use_case_gate", { ext_id: "UC02", gate: "audit_log", reason: "x", source: "admin" }]));
  assert.deepEqual(effectiveGates({ ext: "UC02", facts, gov: again }).added, []);
  assert.equal(decideEffective({ ext: "UC02", facts, requested: "GO_SUPERVISED", gates: { ...pass, audit_log: "fail" }, gov: again }).decision.verdict, "NO_GO");
});

test("a waiver is visible, needs its entry, and stops the gate blocking; a rule-set gate is only removed that way", () => {
  const gov = replayGov(log(["waiver", { ext_id: "UC02", gate: "audit_log", approver: "Head of Security", reason: "Logged upstream by the host platform" }]));
  const e = effectiveGates({ ext: "UC02", facts, gov });
  assert.deepEqual(e.waived, ["audit_log"]);
  const g = e.gates.find((x) => x.id === "audit_log")!;
  assert.equal(g.waiver!.approver, "Head of Security");
  const pass = { approved_infrastructure: "pass", data_lawful: "pass", human_final_approval: "pass", ai_disclosure: "pass" } as const;
  assert.equal(decideEffective({ ext: "UC02", facts, requested: "GO_SUPERVISED", gates: pass, gov }).decision.verdict, "GO_SUPERVISED");
  assert.equal(decide({ clientFacing: true, requested: "GO_SUPERVISED", gates: pass }).verdict, "ESCALATE");
  assert.ok(traceGates(e).find((x) => x.id === "audit_log")!.waived_by === "Head of Security");
  assert.deepEqual(approvalBlockers(e, pass), []);
});

test("an admin-added gate required by a rule set, with a flag condition", () => {
  const gov = replayGov(log(["gate_added", { gate: "rights_review", def: { ...def, category: "functional", requires: ["affects_rights"], rulesets: ["uae-federal"] }, signed_off_by: "a" }]));
  const plain = effectiveGates({ ext: "UCX", facts, gov });
  assert.deepEqual(plain.added, []);
  const rights = effectiveGates({ ext: "UCX", facts: { ...facts, affects_rights: true }, gov });
  assert.deepEqual(rights.added, ["rights_review"]);
  assert.match(rights.gates.find((g) => g.id === "rights_review")!.reason, /Required by UAE federal/);
  assert.deepEqual(effectiveGates({ ext: "UCX", facts: { ...facts, affects_rights: true }, ruleset: SG_IMDA, gov }).added, []);
  assert.deepEqual(affectedUseCases([{ ext_id: "A", facts }, { ext_id: "B", facts: { ...facts, affects_rights: true } }], EMPTY_GOV, gov), ["B"]);
});

test("the gate log is hash-chained; edits are detected; state replays from it", () => {
  const es = log(["gate_added", { gate: "latency_p50", def, signed_off_by: "a" }], ["use_case_gate", { ext_id: "UC02", gate: "latency_p50", reason: "r", source: "task" }]);
  assert.ok(verifyGov(es).ok);
  const t = es.map((e, i) => (i === 0 ? { ...e, payload: { ...e.payload, signed_off_by: "someone else" } } : e));
  assert.equal(verifyGov(t).ok, false);
  const gov = replayGov(es);
  assert.equal(gov.custom.latency_p50.version, 1);
  assert.equal(gov.added.UC02[0].source, "task");
  const changed = replayGov([...es, appendGov(es[1], "gate_changed", "b", { gate: "latency_p50", def: { ...def, label: "Median latency under 2 s" }, signed_off_by: "b" }, NOW)]);
  assert.equal(changed.custom.latency_p50.version, 2);
  assert.equal(changed.custom.latency_p50.def.label, "Median latency under 2 s");
});

test("approval needs every effective gate to be pass", () => {
  const gov = replayGov(log(["gate_added", { gate: "latency_p50", def, signed_off_by: "a" }], ["use_case_gate", { ext_id: "UC02", gate: "latency_p50", reason: "r", source: "requirement" }]));
  const e = effectiveGates({ ext: "UC02", facts, gov });
  const all = { approved_infrastructure: "pass", audit_log: "pass", data_lawful: "pass", human_final_approval: "pass", ai_disclosure: "pass" } as const;
  assert.deepEqual(approvalBlockers(e, all).map((b) => b.id), ["latency_p50"]);
  assert.deepEqual(approvalBlockers(e, { ...all, latency_p50: "pass" }), []);
  assert.deepEqual(approvalBlockers(e, { ...all, latency_p50: "fix_declared" }).map((b) => b.status), ["fix_declared"]);
});

test("metric gates: typed threshold check with a simulated source", () => {
  const r = parseGateDef({ ...def, evidence: "metric", metric: { name: "p50 latency", op: "<=", threshold: 2, unit: "s" } }, { custom: true });
  assert.ok(r.ok && r.def.metric!.source === "simulated");
  const m = r.ok ? r.def.metric! : (null as never);
  assert.equal(metricStatus(m, 1.9), "pass");
  assert.equal(metricStatus(m, 2.1), "fail");
  assert.equal(metricStatus(m, null), "unknown");
  assert.equal(metricStatus({ ...m, op: ">=" }, 2), "pass");
  assert.equal(simulatedMetric("g", "UC02", m), simulatedMetric("g", "UC02", m));
  const gov = replayGov(log(["gate_added", { gate: "lat", def: { ...def, evidence: "metric", metric: m }, signed_off_by: "a" }], ["use_case_gate", { ext_id: "UC02", gate: "lat", reason: "r", source: "requirement" }]));
  const e = effectiveGates({ ext: "UC02", facts, gov });
  const ev = evidenceFor(e, "UC02", {});
  assert.ok(ev.lat === "pass" || ev.lat === "fail");
});

test("a run records the effective gates and why on the verdict trace, and replays under them", async () => {
  const chunks = loadChunksFrom();
  const gov = replayGov(log(["gate_added", { gate: "latency_p50", def, signed_off_by: "a" }], ["use_case_gate", { ext_id: "UC02", gate: "latency_p50", reason: "Citizens wait on screen", source: "requirement" }]));
  const effective = effectiveGates({ ext: "UC02", facts, gov });
  const env: RunEnv = { now: () => NOW, chunks, effective };
  let run: RunState = startRun(S1, "S1-gates");
  while (!run.done) run = await nextStep(S1, run, env);
  assert.ok(verifyLog(run.log).ok);
  // the staged scenario has no evidence for the added gate: the last step can no longer be GO_SUPERVISED
  assert.notEqual(run.steps[run.steps.length - 1].outcome, "GO_SUPERVISED");
  const verdicts = run.log.filter((r) => r.disposition === "verdict");
  assert.ok(verdicts.every((v) => v.effective_gates?.some((g) => g.id === "latency_p50" && g.source === "use_case" && /Citizens wait/.test(g.reason))));
  assert.deepEqual(replayVerdicts(run.log, { ...run.state!, gates: {}, requested: "ASSISTANT_ONLY", hitlBreaches: [], useCaseGates: [], waived: [] }, () => true).mismatches, []);
  // and an ordinary run still records nothing extra, so existing logs and hashes are unchanged
  let plain: RunState = startRun(S1, "S1-plain");
  while (!plain.done) plain = await nextStep(S1, plain, { now: () => NOW, chunks, effective: effectiveGates({ ext: "UC02", facts }) });
  assert.ok(plain.log.every((r) => r.effective_gates === undefined));
  assert.deepEqual(plain.steps.map((s) => s.outcome), ["ESCALATE", "NO_GO", "NO_GO", "ASSISTANT_ONLY", "GO_SUPERVISED"]);
});

test("the gate routes are admin-only and check before reading the body; the migration is a new file", () => {
  for (const f of ["src/app/api/admin/un/gates/route.ts", "src/app/api/admin/un/use-cases/[id]/gates/route.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(src.indexOf("requireAdmin()") > 0 && src.indexOf("requireAdmin()") < src.indexOf("request.json()"), f);
  }
  assert.match(readFileSync("supabase/un-gates.sql", "utf8"), /create table if not exists public\.un_gate_log/);
  assert.doesNotMatch(readFileSync("supabase/schema.sql", "utf8"), /un_gate_log/);
});

test("every Arabic key the gate screens use exists, with the English placeholders", () => {
  const files = ["src/app/admin/federal/gates/page.tsx", "src/app/admin/federal/gates/GateForm.tsx", "src/app/admin/federal/use-cases/[id]/UseCaseGates.tsx", "src/app/admin/federal/use-cases/[id]/GateActions.tsx", "src/app/admin/federal/FederalPanel.tsx", "src/app/admin/federal/compare/page.tsx"];
  const keys = new Set<string>(["go.gates", "go.gates.h"]);
  const sources = files.map((f) => readFileSync(f, "utf8")).join("\n");
  for (const m of sources.matchAll(/\bk="((?:gt|go)\.[\w.-]+)"/g)) keys.add(m[1]);
  for (const m of sources.matchAll(/tr\(lang, "((?:gt)\.[\w.-]+)"/g)) keys.add(m[1]);
  for (const k of ["functional", "non-functional"]) keys.add(`gt.cat.${k}`);
  for (const k of EVIDENCE_SOURCES) keys.add(`gt.ev.${k}`);
  for (const k of ["gate_added", "gate_changed", "use_case_gate", "waiver", "rerun"]) keys.add(`gt.k.${k}`);
  assert.ok(keys.size > 80, `found ${keys.size}`);
  assert.deepEqual([...keys].filter((k) => !AR[k]), []);
  for (const m of sources.matchAll(/k="((?:gt|go)\.[\w.-]+)" en="([^"]*)"/g)) {
    const want = [...m[2].matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
    const got = [...(AR[m[1]] ?? "").matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
    assert.deepEqual(got, want, m[1]);
  }
});
