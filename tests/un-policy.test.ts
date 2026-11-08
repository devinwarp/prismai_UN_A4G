import assert from "node:assert/strict";
import test from "node:test";
import { decide, type GateState } from "../src/lib/un/policy.ts";
import { reconcile, refusal, type AgentMessage, type CaseState } from "../src/lib/un/protocol.ts";

const allUnknown: GateState = {};
const passAll: GateState = {
  approved_infrastructure: "pass", audit_log: "pass", data_lawful: "pass",
  human_final_approval: "pass", ai_disclosure: "pass",
};

test("a failed gate is never averaged away", () => {
  const d = decide({ clientFacing: true, requested: "GO_AUTONOMOUS", gates: { ...passAll, audit_log: "fail" } });
  assert.equal(d.verdict, "NO_GO");
});

test("client-facing is capped at GO_SUPERVISED; internal may be autonomous", () => {
  assert.equal(decide({ clientFacing: true, requested: "GO_AUTONOMOUS", gates: passAll }).verdict, "GO_SUPERVISED");
  const internal: GateState = { approved_infrastructure: "pass", audit_log: "pass", data_lawful: "pass" };
  assert.equal(decide({ clientFacing: false, requested: "GO_AUTONOMOUS", gates: internal }).verdict, "GO_AUTONOMOUS");
});

test("no evidence escalates; declared fixes are assistant-only", () => {
  assert.equal(decide({ clientFacing: true, requested: "GO_AUTONOMOUS", gates: allUnknown }).verdict, "ESCALATE");
  assert.equal(decide({ clientFacing: true, requested: "GO_SUPERVISED", gates: { ...passAll, ai_disclosure: "fix_declared" } }).verdict, "ASSISTANT_ONLY");
});

const has = (id: string) => id === "kb#1";
const msg = (o: Partial<AgentMessage>): AgentMessage => ({
  msg_id: "m", from: "security", to: ["coordinator"], type: "CHALLENGE", re: "UC02",
  gate: "approved_infrastructure", status: "fail", reason: "r", evidence: ["evt_T1"], kb: [], ...o,
});

test("refusals: not the owner, uncited, ghost citation, pass without evidence", () => {
  assert.match(refusal(msg({ from: "finance" }), has)!, /does not own/);
  assert.match(refusal(msg({ evidence: [] }), has)!, /uncited/);
  assert.match(refusal(msg({ kb: ["kb#404"] }), has)!, /does not exist/);
  assert.match(refusal(msg({ status: "pass", evidence: [], kb: ["kb#1"] }), has)!, /needs evidence/);
  assert.match(refusal(msg({ from: "security", status: "fix_declared" }), has)!, /only the innovator/);
  assert.equal(refusal(msg({}), has), null);
});

// Scenario S1 from the audit: UC02 renewal pre-check, four rounds.
test("S1 verdict path: ESCALATE, NO_GO, NO_GO, ASSISTANT_ONLY, GO_SUPERVISED", () => {
  let s: CaseState = { ext_id: "UC02", clientFacing: true, requested: "ASSISTANT_ONLY", gates: {} };
  const path: string[] = [];
  const step = (msgs: AgentMessage[]) => {
    const r = reconcile(s, msgs, has);
    assert.deepEqual(r.rejected, []);
    s = r.state;
    path.push(r.decision.verdict);
  };
  step([msg({ from: "innovator", type: "PROPOSE", gate: undefined, status: undefined, requested: "GO_AUTONOMOUS", evidence: [] })]);
  step([msg({})]); // security: hosting fails
  step([msg({ from: "compliance", gate: "human_final_approval", evidence: ["evt_T2"] })]);
  step([
    msg({ from: "innovator", gate: "approved_infrastructure", status: "fix_declared", evidence: ["evt_T3"] }),
    msg({ from: "innovator", gate: "human_final_approval", status: "fix_declared", evidence: ["evt_T3"] }),
    msg({ from: "security", gate: "audit_log", status: "pass", evidence: ["log"] }),
    msg({ from: "privacy", gate: "data_lawful", status: "pass", evidence: ["dpa"] }),
    msg({ from: "compliance", gate: "ai_disclosure", status: "pass", evidence: ["script"] }),
  ]);
  step([
    msg({ gate: "approved_infrastructure", status: "pass", evidence: ["retest_T4"] }),
    msg({ from: "compliance", gate: "human_final_approval", status: "pass", evidence: ["retest_T4"] }),
  ]);
  assert.deepEqual(path, ["ESCALATE", "NO_GO", "NO_GO", "ASSISTANT_ONLY", "GO_SUPERVISED"]);
});
