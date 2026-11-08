import assert from "node:assert/strict";
import test from "node:test";
import { applicableRules, hitlBreaches } from "../src/lib/un/hitl.ts";
import { parseUseCases } from "../src/lib/un/model.ts";
import { decide, type GateState } from "../src/lib/un/policy.ts";
import { reconcile } from "../src/lib/un/protocol.ts";

const passAll: GateState = {
  approved_infrastructure: "pass", audit_log: "pass", data_lawful: "pass",
  human_final_approval: "pass", ai_disclosure: "pass",
};
const internal = { client_facing: false, affects_rights: true, irreversible: true };

test("rules apply by fact; an entity can switch one off", () => {
  assert.deepEqual(applicableRules({}, "E", { client_facing: true }), ["client_facing_final_approval"]);
  assert.deepEqual(applicableRules({}, "E", internal), ["rights_or_fees_human_decision", "irreversible_human_approval"]);
  assert.deepEqual(applicableRules({ E: ["irreversible_human_approval"] }, "E", internal), ["rights_or_fees_human_decision"]);
  assert.deepEqual(applicableRules({ Other: ["irreversible_human_approval"] }, "E", internal).length, 2);
});

test("only applicable rules can be breached", () => {
  assert.deepEqual(hitlBreaches({}, "E", { client_facing: false }, ["irreversible_human_approval"]), []);
  assert.deepEqual(hitlBreaches({}, "E", internal, ["irreversible_human_approval"]), ["irreversible_human_approval"]);
  assert.deepEqual(hitlBreaches({ E: ["irreversible_human_approval"] }, "E", internal, ["irreversible_human_approval"]), []);
});

test("a breached rule is a hard NO_GO even when every gate passes, and for internal cases", () => {
  const d = decide({ clientFacing: true, requested: "GO_SUPERVISED", gates: passAll, hitlBreaches: ["client_facing_final_approval"] });
  assert.equal(d.verdict, "NO_GO");
  assert.match(d.reasons.join(), /human-in-the-loop rule unmet/);
  assert.equal(decide({ clientFacing: false, requested: "GO_AUTONOMOUS", gates: passAll, hitlBreaches: ["irreversible_human_approval"] }).verdict, "NO_GO");
  assert.equal(decide({ clientFacing: true, requested: "GO_SUPERVISED", gates: passAll, hitlBreaches: [] }).verdict, "GO_SUPERVISED");
});

test("breaches flow through reconcile; no breaches leaves the verdict unchanged", () => {
  const base = { ext_id: "UC02", clientFacing: true, requested: "GO_SUPERVISED" as const, gates: passAll };
  assert.equal(reconcile(base, [], () => true).decision.verdict, "GO_SUPERVISED");
  assert.equal(reconcile({ ...base, hitlBreaches: ["client_facing_final_approval"] }, [], () => true).decision.verdict, "NO_GO");
});

test("CSV: affects_rights and irreversible are optional; old CSVs stay valid and omit the keys", () => {
  const old = parseUseCases("id,entity,use_case,quadrant\nA,E,T,Internal Agents\n");
  assert.equal(old.errors.length, 0);
  assert.ok(!("affects_rights" in old.useCases[0]) && !("irreversible" in old.useCases[0]));
  const nu = parseUseCases("id,entity,use_case,quadrant,affects_rights,irreversible\nA,E,T,Internal Agents,yes,\n");
  assert.equal(nu.useCases[0].affects_rights, true);
  assert.equal(nu.useCases[0].irreversible, false);
});
