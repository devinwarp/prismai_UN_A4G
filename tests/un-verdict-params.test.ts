import assert from "node:assert/strict";
import test from "node:test";
import { appendParam, DEFAULT_PARAMS, FLOORS, paramsHash, planParams, replayParams, validateParams, verifyParams, type ParamAction, type ParamEntry, type Params } from "../src/lib/un/verdict-params.ts";

const OWNER = { title: "Head of Licensing", source: "process_owner" };
const P: Params = { ...DEFAULT_PARAMS };
const with_ = (o: Partial<Params>): Params => ({ ...P, ...o });

function build(...steps: [ParamAction, string][]) {
  const log: ParamEntry[] = [];
  let n = 0;
  for (const [a, by] of steps) {
    const p = planParams(replayParams(log), a, by);
    assert.equal(p.ok, true, p.ok ? "" : p.error);
    if (p.ok) log.push(appendParam(log[log.length - 1] ?? null, p.kind, by, p.payload, `2026-11-21T10:00:${String(n++).padStart(2, "0")}Z`));
  }
  return log;
}
const refused = (log: ParamEntry[], a: ParamAction, by = "u1") => { const p = planParams(replayParams(log), a, by); return p.ok ? "" : p.error; };

test("the default parameters are valid, and a use case may be stricter than the governance floors", () => {
  assert.deepEqual(validateParams(DEFAULT_PARAMS), []);
  assert.deepEqual(validateParams(with_({ hallucination_max: 0.01, accuracy_lower_bound_min: 0.97, min_runs_per_test: 10, latency_p95_ms_max: 4000, cost_per_case_max: 0.5 })), []);
});

test("a use case cannot be looser than the governance floors, and the message says which", () => {
  const e = (o: Partial<Params>) => validateParams(with_(o)).join("; ");
  assert.match(e({ hallucination_max: 0.1 }), /hallucination_max 0.1 is looser than the governance limit 0.05/);
  assert.match(e({ rejected_calls_max: 1 }), /rejected_calls_max 1 is looser/);
  assert.match(e({ client_facing_compliance_min: 0.9 }), /client_facing_compliance_min 0.9 is looser than the governance floor 1/);
  assert.match(e({ accuracy_lower_bound_min: 0.7 }), /accuracy_lower_bound_min 0.7 is looser than the governance floor 0.8/);
  assert.match(e({ alignment_controls_min: 0.95 }), /alignment_controls_min/);
  assert.match(e({ min_tests_per_task: 2 }), /min_tests_per_task 2 is below the floor 3/);
  assert.match(e({ confidence: 0.8 }), /confidence 0.8 is below the floor 0.9/);
  assert.equal(FLOORS.rejected_calls_max, 0, "the floor for rejected calls is zero");
});

test("malformed parameters are refused: unknown keys, wrong types, out-of-range values", () => {
  assert.match(validateParams(null).join(), /must be an object/);
  assert.match(validateParams({ ...P, mystery: 1 }).join(), /Unknown parameter "mystery"/);
  assert.match(validateParams({ ...P, hallucination_max: "low" }).join(), /hallucination_max must be a number/);
  assert.match(validateParams({ ...P, accuracy_lower_bound_min: 1.5 }).join(), /between 0 and 1/);
  assert.match(validateParams({ ...P, rejected_calls_max: 0.5 }).join(), /whole number/);
  assert.match(validateParams({ ...P, latency_p95_ms_max: 0 }).join(), /positive number, or null/);
  assert.match(validateParams({ ...P, min_runs_per_test: 0 }).join(), /whole number, 1 or more/);
  const missing: Partial<Params> = { ...P };
  delete missing.confidence;
  assert.match(validateParams(missing).join(), /confidence must be a number/);
});

test("the hash of a set of parameters is stable, ignores key order, and changes with any value", () => {
  assert.equal(paramsHash(P), paramsHash({ ...P }));
  assert.equal(paramsHash(P), paramsHash(Object.fromEntries(Object.entries(P).reverse()) as unknown as Params));
  assert.notEqual(paramsHash(P), paramsHash(with_({ hallucination_max: 0.04 })));
  assert.notEqual(paramsHash(P), paramsHash(with_({ latency_p95_ms_max: 5000 })));
});

test("propose, then approve: the approval locks the parameters at their hash", () => {
  assert.match(refused([], { type: "approve", approver: OWNER }, "u2"), /no proposal waiting/);
  const log = build([{ type: "propose", params: P, note: "first draft" }, "u1"], [{ type: "approve", approver: OWNER }, "u2"]);
  const s = replayParams(log);
  assert.equal(s.pending, null);
  assert.equal(s.approved!.version, 1);
  assert.equal(s.approved!.hash, paramsHash(P));
  assert.deepEqual(s.approved!.params, P);
  assert.equal(s.approved!.approver, "Head of Licensing");
  assert.match(refused([], { type: "propose", params: with_({ hallucination_max: 0.5 }) }), /looser than the governance limit/);
});

test("separation of duties: whoever proposed the parameters cannot approve them without a logged reason", () => {
  const proposed = build([{ type: "propose", params: P }, "u1"]);
  assert.match(refused(proposed, { type: "approve", approver: OWNER }, "u1"), /you cannot also approve them unless you give the reason/);
  assert.equal(refused(proposed, { type: "approve", approver: OWNER }, "u2"), "");
  const self = build([{ type: "propose", params: P }, "u1"], [{ type: "approve", approver: OWNER, self_approval_reason: "One-person demo team" }, "u1"]);
  assert.equal(replayParams(self).approved!.self_approval_reason, "One-person demo team");
});

test("a change is a new proposal and a new version; the earlier approval stays in force until the new one is approved", () => {
  const v1 = build([{ type: "propose", params: P }, "u1"], [{ type: "approve", approver: OWNER }, "u2"]);
  assert.match(refused(v1, { type: "propose", params: { ...P } }), /already approved and nothing has changed/);
  const stricter = with_({ hallucination_max: 0.02 });
  const pend = build([{ type: "propose", params: P }, "u1"], [{ type: "approve", approver: OWNER }, "u2"], [{ type: "propose", params: stricter }, "u1"]);
  const s = replayParams(pend);
  assert.equal(s.pending!.version, 2);
  assert.equal(s.approved!.version, 1, "the approved parameters are not changed by a proposal");
  assert.equal(s.approved!.params.hallucination_max, 0.05);
  const v2 = build([{ type: "propose", params: P }, "u1"], [{ type: "approve", approver: OWNER }, "u2"], [{ type: "propose", params: stricter }, "u1"], [{ type: "approve", approver: OWNER }, "u2"]);
  assert.equal(replayParams(v2).approved!.version, 2);
  assert.notEqual(replayParams(v2).approved!.hash, replayParams(v1).approved!.hash);
});

test("an approval can be withdrawn with a reason; after that new parameters must be proposed and approved", () => {
  const approved = build([{ type: "propose", params: P }, "u1"], [{ type: "approve", approver: OWNER }, "u2"]);
  assert.match(refused(build([{ type: "propose", params: P }, "u1"]), { type: "withdraw", reason: "x" }), /no approval to withdraw/);
  assert.match(refused(approved, { type: "withdraw", reason: "" }), /needs a reason/);
  const w = build([{ type: "propose", params: P }, "u1"], [{ type: "approve", approver: OWNER }, "u2"], [{ type: "withdraw", reason: "The SOP is being rewritten" }, "u2"]);
  assert.equal(replayParams(w).approved, null);
  assert.match(refused(w, { type: "approve", approver: OWNER }, "u2"), /no proposal waiting/);
});

test("the governance limits are checked again at approval: a proposal that was valid when written can be refused later", () => {
  // written when the limit was looser: an entry the way an older version of the rules would have produced it
  const loose = { ...P, hallucination_max: 0.2 };
  const log: ParamEntry[] = [appendParam(null, "proposed", "u1", { params: loose, by: "u1" }, "2026-11-21T10:00:00Z")];
  assert.match(refused(log, { type: "approve", approver: OWNER }, "u2"), /no longer meets the governance limits: hallucination_max 0.2 is looser/);
});

test("the log is a hash chain: it verifies, and an edited entry is detected", () => {
  const log = build([{ type: "propose", params: P }, "u1"], [{ type: "approve", approver: OWNER }, "u2"]);
  assert.deepEqual(verifyParams(log), { ok: true });
  const forged = log.map((e, i) => (i === 0 ? { ...e, payload: { ...e.payload, params: { ...P, hallucination_max: 0.5 } } } : e));
  const v = verifyParams(forged);
  assert.equal(v.ok, false);
  assert.equal((v as { broken_seq: number }).broken_seq, 1);
});
