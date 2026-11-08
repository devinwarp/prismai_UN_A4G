import assert from "node:assert/strict";
import test from "node:test";
import { attest, buildReport, simulatedSijil, TARGET_RUNS, type Profile } from "../src/lib/un/sijil.ts";

const gen = (profile: Profile, n = TARGET_RUNS, id = "UC01") => simulatedSijil.runs({ ext_id: id }, profile, 1, n);

test("the simulated adapter is deterministic and numbers runs from the offset", () => {
  assert.deepEqual(gen("healthy", 5), gen("healthy", 5));
  assert.notDeepEqual(gen("healthy", 5, "UC01"), gen("healthy", 5, "UC02"));
  assert.deepEqual(simulatedSijil.runs({ ext_id: "UC01" }, "healthy", 11, 3).map((r) => r.run_no), [11, 12, 13]);
  assert.deepEqual(gen("healthy", 30).slice(0, 10), gen("healthy", 10)); // a batch continues the same stream
});

test("a healthy profile passes; each failing profile fails for its own reason", () => {
  assert.equal(attest(gen("healthy")).pass, true);
  assert.match(attest(gen("hallucinating")).failing.join(), /Hallucination rate/);
  assert.match(attest(gen("drifting")).failing.join(), /Accuracy|Hallucination/);
  const bypass = attest(gen("bypasses_human"));
  assert.equal(bypass.pass, false);
  assert.match(bypass.failing.join(), /human_final_approval/);
  assert.ok(bypass.rejects.human_final_approval > 0);
});

test("a hard-criterion reject fails even when every measure is perfect", () => {
  const runs = gen("healthy").map((r, i) => (i === 7 ? { ...r, rejects: { ...r.rejects, ai_disclosure: 1 } } : r));
  const a = attest(runs);
  assert.equal(a.pass, false);
  assert.equal(a.failing.length, 1);
});

test("no runs is never a pass", () => {
  assert.equal(attest([]).pass, false);
});

test("drift: later runs are worse than earlier ones", () => {
  const r = gen("drifting");
  assert.ok(r[29].accuracy < r[0].accuracy);
  assert.ok(r[29].hallucination_rate > r[0].hallucination_rate);
});

test("the report states the data is simulated, the result, and a hash", () => {
  const runs = gen("hallucinating");
  const md = buildReport({
    uc: { ext_id: "UC01", title: "Voice contact centre", entity: "Marsa", quadrant: "External Agents", client_facing: true, hitl_rule: "Officer approves", verdict: null },
    runs, policyName: "UAE", adapter: simulatedSijil.label, filedAt: "2026-11-08T10:00:00Z",
  });
  assert.match(md, /Sijil \(simulated\)/);
  assert.match(md, /synthetic/);
  assert.match(md, /Attestation: FAIL over 30 runs/);
  assert.match(md, /Hallucination rate .* \| at most 1% \| \*\*not met\*\*/);
  assert.match(md, /Run data sha256: [0-9a-f]{64}/);
});
