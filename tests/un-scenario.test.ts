import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_POLICY, parseUseCases, type UnUseCaseState } from "../src/lib/un/model.ts";
import { nextStep, startRun, type RunEnv, type RunState, type Scenario } from "../src/lib/un/scenario.ts";
import { S1, S2, S3, S4 } from "../src/lib/un/scenarios.ts";
import { loadChunksFrom } from "./helpers-un.ts";
import { replayVerdicts, verifyLog } from "../src/lib/un/trace.ts";

const chunks = loadChunksFrom();
const env: RunEnv = { now: () => "2026-11-08T10:00:00Z", chunks };
const has = (id: string) => chunks.some((c) => c.chunk_id === id);

async function runAll(sc: Scenario, run: RunState, e: RunEnv = env) {
  while (!run.done) run = await nextStep(sc, run, e);
  return run;
}

test("S1 runs step by step and every step matches the expected verdict", async () => {
  let run = startRun(S1, "S1-run-01");
  run = await nextStep(S1, run, env);
  assert.equal(run.steps.length, 1); // one step released, not all
  assert.equal(run.steps[0].outcome, "ESCALATE");
  run = await runAll(S1, run);
  assert.deepEqual(run.steps.map((s) => s.outcome), ["ESCALATE", "NO_GO", "NO_GO", "ASSISTANT_ONLY", "GO_SUPERVISED"]);
  assert.ok(run.steps.every((s) => s.match));
});

test("S1: each agent's trace shows only events routed to it", async () => {
  const run = await runAll(S1, startRun(S1, "r"));
  const t2 = run.log.filter((r) => r.step === "T2");
  assert.ok(t2.some((r) => r.agent === "compliance" && r.inputs_seen.includes("S1-T2-hitl")));
  assert.ok(!run.log.some((r) => r.agent === "security" && r.inputs_seen.includes("S1-T2-hitl")));
  assert.ok(new Set(run.log.map((r) => r.agent)).size >= 5);
});

test("S1: the log verifies, citations are real quotes, verdicts link to their traces", async () => {
  const run = await runAll(S1, startRun(S1, "r"));
  assert.ok(verifyLog(run.log).ok);
  for (const r of run.log) for (const c of r.kb_citations) {
    assert.ok(has(c.chunk_id), c.chunk_id);
    assert.ok(chunks.find((k) => k.chunk_id === c.chunk_id)!.text.includes(c.quote.replace(/^…|…$/g, "")));
  }
  const verdicts = run.log.filter((r) => r.disposition === "verdict");
  assert.equal(verdicts.length, 5);
  for (const v of verdicts) {
    assert.ok(v.derived_from.length > 0);
    assert.ok(v.derived_from.every((id) => run.log.some((r) => r.trace_id === id && r.step === v.step)));
  }
});

test("S1: a run replays from its log, and a tampered log fails the verifier", async () => {
  const run = await runAll(S1, startRun(S1, "r"));
  assert.ok(replayVerdicts(run.log, { ext_id: "UC02", clientFacing: true, requested: "ASSISTANT_ONLY", gates: {} }, has).ok);
  const forged = structuredClone(run.log);
  forged[3].claims[0].text = "Hosting report: the model endpoint IS certified";
  assert.equal(verifyLog(forged).ok, false);
  assert.equal(verifyLog(forged).brokenAt, 3);
});

test("same inputs and clock reproduce the identical log (deterministic mode)", async () => {
  const a = await runAll(S1, startRun(S1, "r"));
  const b = await runAll(S1, startRun(S1, "r"));
  assert.deepEqual(a.log.map((r) => r.hash), b.log.map((r) => r.hash));
});

test("S3: portfolio steps hit the audit's numbers on a sandbox copy", async () => {
  const { useCases } = parseUseCases(readFileSync("data/un-use-cases.csv", "utf8"));
  const live: UnUseCaseState[] = useCases.map((u, i) => ({ ...u, id: `id${i}`, stage: "intake", verdict: null, compliant: false }));
  const run = await runAll(S3, startRun(S3, "S3-run", { cases: live, policy: DEFAULT_POLICY }));
  assert.ok(run.steps.every((s) => s.match), run.steps.map((s) => `${s.step}: ${s.outcome}`).join("\n"));
  assert.ok(live.every((u) => u.verdict === null)); // live data untouched
  assert.ok(verifyLog(run.log).ok);
  assert.equal(run.log.filter((r) => r.disposition === "dashboard").length, 4);
});

test("S2: hallucination alert pulls a live pilot back, re-test restores it with the added gate", async () => {
  const run = await runAll(S2, startRun(S2, "S2-run"));
  assert.deepEqual(run.steps.map((s) => s.outcome), ["GO_SUPERVISED", "ASSISTANT_ONLY", "NO_GO", "NO_GO", "ASSISTANT_ONLY", "GO_SUPERVISED"]);
  assert.ok(run.steps.every((s) => s.match));
  assert.deepEqual(run.state!.extraGates, ["hallucination_rate", "fee_accuracy"]);
  // visibility: the alert reached compliance only; the complaint frontline only; the KB requirement the adviser only
  const saw = (id: string) => [...new Set(run.log.filter((r) => r.inputs_seen.includes(id)).map((r) => r.agent))];
  assert.deepEqual(saw("S2-T1-alert"), ["compliance"]);
  assert.deepEqual(saw("S2-T2-complaint"), ["frontline"]);
  assert.deepEqual(saw("S2-T3-kb"), ["policy_adviser"]);
});

test("S2: log verifies, replays from the log, and a tampered log fails", async () => {
  const run = await runAll(S2, startRun(S2, "r"));
  assert.ok(verifyLog(run.log).ok);
  assert.ok(replayVerdicts(run.log, { ext_id: "UC01", clientFacing: true, requested: "ASSISTANT_ONLY", gates: {} }, has).ok);
  const forged = structuredClone(run.log);
  forged[4].claims[0].text = "Sijil alert: hallucination rate 0.1%";
  assert.equal(verifyLog(forged).ok, false);
});

test("I-2: S1 T2 fails human_final_approval through the entity's HITL rule and cites its id", async () => {
  const run = await runAll(S1, startRun(S1, "r"));
  const t2 = run.steps[2];
  assert.equal(t2.outcome, "NO_GO");
  assert.ok(t2.reasons.some((x) => x.includes("client_facing_final_approval")));
  const verdict = run.log.find((r) => r.step === "T2" && r.disposition === "verdict")!;
  assert.deepEqual(verdict.hitl_breaches, ["client_facing_final_approval"]);
  // lifted once the owner restores officer release: the rest of the path is unchanged
  assert.deepEqual(run.steps.map((s) => s.outcome), ["ESCALATE", "NO_GO", "NO_GO", "ASSISTANT_ONLY", "GO_SUPERVISED"]);
  assert.ok(replayVerdicts(run.log, { ext_id: "UC02", clientFacing: true, requested: "ASSISTANT_ONLY", gates: {} }, has).ok);
});

test("I-2: switching the entity's rule off removes the HITL breach from the T2 reason", async () => {
  const hitl = { config: { Marsa: ["client_facing_final_approval" as const] }, entity: "Marsa", facts: { client_facing: true, affects_rights: false, irreversible: false } };
  const run = await runAll(S1, startRun(S1, "r"), { ...env, hitl });
  assert.ok(!run.steps[2].reasons.some((x) => x.includes("client_facing_final_approval")));
  assert.equal(run.steps[2].outcome, "NO_GO"); // the gate itself still failed
});

test("C2-1: S1 uses every protocol message type, and the verdict path is unchanged", async () => {
  const run = await runAll(S1, startRun(S1, "r"));
  const types = new Set(run.log.flatMap((r) => (r.message ? [r.message.type] : [])));
  for (const t of ["PROPOSE", "CHALLENGE", "EVIDENCE_REQUEST", "EVIDENCE", "POSITION_UPDATE", "ESCALATE", "VERDICT"]) assert.ok(types.has(t as never), t);
  assert.deepEqual(run.steps.map((s) => s.outcome), ["ESCALATE", "NO_GO", "NO_GO", "ASSISTANT_ONLY", "GO_SUPERVISED"]);
  assert.ok(verifyLog(run.log).ok);
});

test("C2-1: the coordinator asks each gate's owner for missing evidence once; the owner answers 'not available'", async () => {
  const run = await runAll(S1, startRun(S1, "r"));
  const reqs = run.log.filter((r) => r.message?.type === "EVIDENCE_REQUEST");
  assert.deepEqual(reqs.map((r) => [r.step, r.message!.gate, r.message!.to[0]]), [["T0", "approved_infrastructure", "security"], ["T0", "human_final_approval", "compliance"]]);
  const answer = run.log.find((r) => r.step === "T0" && r.agent === "security" && r.message?.gate === "approved_infrastructure")!;
  assert.equal(answer.message!.type, "EVIDENCE");
  assert.equal(answer.message!.status, undefined); // an unknown is not a claim: no gate changes
});

test("C2-1: a CHALLENGE reaches the affected roles, the applicant answers it, two open failures escalate to the human", async () => {
  const run = await runAll(S1, startRun(S1, "r"));
  const ch = run.log.find((r) => r.step === "T1" && r.message?.type === "CHALLENGE")!;
  assert.deepEqual(ch.message!.to, ["coordinator", "innovator", "policy_adviser", "frontline"]);
  assert.ok(run.log.some((r) => r.step === "T1" && r.agent === "innovator" && r.message?.type === "POSITION_UPDATE" && !r.message.status));
  assert.ok(!run.log.some((r) => r.step === "T1" && r.message?.type === "ESCALATE")); // one failure is not yet two
  const esc = run.log.find((r) => r.message?.type === "ESCALATE")!;
  assert.equal(esc.step, "T2");
  assert.match(esc.message!.reason, /approved_infrastructure,human_final_approval/);
  assert.equal(run.log.filter((r) => r.message?.type === "ESCALATE").length, 1); // not repeated at T3
});

test("C2-3: every S2 event moves the outcome or a gate; the alert's containment gives ASSISTANT_ONLY, not NO_GO", async () => {
  const run = await runAll(S2, startRun(S2, "r"));
  assert.equal(run.steps[1].outcome, "ASSISTANT_ONLY");
  assert.ok(run.steps[1].reasons.some((x) => x.includes("Fix declared")));
  // the outcome changes at every step except where a fix has just been declared twice over
  const gatesAt = (n: number) => JSON.stringify(Object.entries(replayState(run, n)));
  function replayState(r: RunState, upTo: number) {
    const m: Record<string, string> = {};
    for (const s of r.steps.slice(0, upTo + 1)) for (const e of s.events) if (e.gate && e.status) m[e.gate] = e.status;
    return m;
  }
  for (let i = 1; i < run.steps.length; i++) assert.notEqual(gatesAt(i), gatesAt(i - 1), `step T${i} changed nothing`);
});

test("C2-3: the complaint links to the T1 alert and adds the fee_accuracy gate; the transparency requirement re-tests ai_disclosure", async () => {
  const run = await runAll(S2, startRun(S2, "r"));
  const fee = run.log.find((r) => r.step === "T2" && r.message?.gate === "fee_accuracy")!;
  assert.equal(fee.agent, "compliance");
  assert.deepEqual(fee.claims[0].evidence, ["S2-T2-fee", "S2-T1-alert"]); // linked to T1
  assert.deepEqual(run.state!.extraGates, ["hallucination_rate", "fee_accuracy"]);
  assert.equal(run.steps[2].outcome, "NO_GO");
  const disc = run.log.find((r) => r.step === "T3" && r.message?.gate === "ai_disclosure")!;
  assert.equal(disc.message!.status, "fail");
  assert.ok(run.log.some((r) => r.step === "T3" && r.message?.type === "ESCALATE")); // two open failures
  assert.deepEqual(run.state!.gates, { approved_infrastructure: "pass", audit_log: "pass", data_lawful: "pass", human_final_approval: "pass", ai_disclosure: "pass", hallucination_rate: "pass", fee_accuracy: "pass" });
});

test("C2-3: a linked event only links events its recipient was shown", () => {
  for (const sc of [S1, S2, S4]) {
    const shown = new Map<string, Set<string>>();
    for (const st of sc.steps) {
      for (const e of st.events) for (const l of (e as { links?: string[] }).links ?? []) for (const r of e.recipients) assert.ok(shown.get(r)?.has(l), `${e.id} links ${l} which ${r} never saw`);
      for (const e of st.events) for (const r of e.recipients) shown.set(r, (shown.get(r) ?? new Set()).add(e.id));
    }
  }
});

test("S4: consumer complaint escalates into a privacy breach; full path equals the declared expected path (6 of 6)", async () => {
  const run = await runAll(S4, startRun(S4, "S4-run"));
  const path = ["ESCALATE", "NO_GO", "NO_GO", "NO_GO", "ASSISTANT_ONLY", "GO_SUPERVISED"];
  assert.deepEqual(run.steps.map((s) => s.outcome), path);
  assert.deepEqual(S4.steps.map((s) => s.expected), path);
  assert.ok(run.steps.every((s) => s.match));
  assert.deepEqual(run.state!.extraGates, ["no_commercial_promotion", "purpose_limitation"]);
  assert.ok(run.steps[1].reasons.some((x) => x.includes("promote paid third-party")));
  assert.equal(run.steps[2].reasons.length, 2); // two open failures
  assert.ok(run.log.some((r) => r.step === "T2" && r.message?.type === "ESCALATE" && /no_commercial_promotion,purpose_limitation/.test(r.message.reason)));
  assert.equal(run.log.filter((r) => r.message?.type === "ESCALATE").length, 1); // referred once, not repeated at T3
  assert.equal(run.state!.gates.no_commercial_promotion, "pass");
  assert.equal(run.state!.gates.purpose_limitation, "pass");
});

test("S4: each event reaches only its recipients", async () => {
  const run = await runAll(S4, startRun(S4, "r"));
  const saw = (id: string) => [...new Set(run.log.filter((r) => r.inputs_seen.includes(id)).map((r) => r.agent))].sort();
  assert.deepEqual(saw("S4-T1-complaint"), ["compliance", "frontline"]);
  assert.deepEqual(saw("S4-T2-log"), ["privacy", "security"]);
  assert.deepEqual(saw("S4-T2-purpose"), ["privacy"]);
  assert.deepEqual(saw("S4-T3-kb"), ["policy_adviser"]);
  assert.ok(!run.log.some((r) => r.step === "T1" && r.agent === "privacy"));
  assert.ok(!run.log.some((r) => r.step === "T2" && r.agent === "compliance"));
});

test("S4: the new gates are optional (absent from S1 runs), owned by compliance and privacy", async () => {
  const s1 = await runAll(S1, startRun(S1, "r"));
  assert.equal(s1.state!.extraGates, undefined);
  const { GATES } = await import("../src/lib/un/policy.ts");
  assert.equal(GATES.no_commercial_promotion.owner, "compliance");
  assert.equal(GATES.purpose_limitation.owner, "privacy");
  assert.ok(GATES.no_commercial_promotion.optional && GATES.purpose_limitation.optional);
});

test("S4: citations resolve to real PDPL, Dubai AI ethics and UAE AI Charter chunks; uncited gate claims stay rejected", async () => {
  const run = await runAll(S4, startRun(S4, "r"));
  const cited = new Set(run.log.flatMap((r) => r.kb_citations.map((c) => c.chunk_id)));
  for (const id of cited) assert.ok(has(id), id);
  for (const src of ["uae-data-protection-laws", "dubai-ai-ethics-2019", "uae-ai-charter"]) {
    assert.ok([...cited].some((id) => id.startsWith(`${src}#`)), src);
  }
  const t3 = run.log.find((r) => r.step === "T3" && r.agent === "policy_adviser")!;
  assert.ok(t3.kb_citations.length > 0 && t3.kb_citations.every((c) => c.chunk_id.startsWith("uae-data-protection-laws#")));
  const { reconcile } = await import("../src/lib/un/protocol.ts");
  const r = reconcile({ ext_id: "UC13", clientFacing: true, requested: "ASSISTANT_ONLY", gates: {} },
    [{ msg_id: "x", from: "privacy", to: ["coordinator"], type: "CHALLENGE", re: "UC13", gate: "purpose_limitation", status: "fail", reason: "r", evidence: [], kb: [] }], has);
  assert.equal(r.rejected.length, 1);
});

test("S4: verdict records link to traces, the hash chain verifies and replays; a tampered log fails", async () => {
  const run = await runAll(S4, startRun(S4, "r"));
  assert.ok(verifyLog(run.log).ok);
  const verdicts = run.log.filter((r) => r.disposition === "verdict");
  assert.equal(verdicts.length, 6);
  for (const v of verdicts) {
    assert.ok(v.derived_from.length > 0);
    assert.ok(v.derived_from.every((id) => run.log.some((r) => r.trace_id === id && r.step === v.step)));
  }
  assert.ok(replayVerdicts(run.log, { ext_id: "UC13", clientFacing: true, requested: "ASSISTANT_ONLY", gates: {} }, has).ok);
  const forged = structuredClone(run.log);
  forged[8].claims[0].text = "Consumer complaint: none";
  assert.equal(verifyLog(forged).ok, false);
});
