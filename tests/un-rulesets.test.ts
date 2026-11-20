import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compare, compareProcesses, flatEvidence, s1EvidenceAt, type ProcessInput } from "../src/lib/un/compare.ts";
import { parseUseCases } from "../src/lib/un/model.ts";
import { GATES, decide, type GateId, type GateState, type GateStatus } from "../src/lib/un/policy.ts";
import { DERIVED_GAPS, EU_AI_ACT, RULESETS, SG_IMDA, UAE_FEDERAL, citedChunks } from "../src/lib/un/rulesets.ts";

const chunkIds = new Set((JSON.parse(readFileSync("kb/chunks.json", "utf8")) as { chunk_id: string }[]).map((c) => c.chunk_id));
const gapIds = new Set((JSON.parse(readFileSync("kb/gaps.json", "utf8")) as { gaps: { id: string }[] }).gaps.map((g) => g.id));
const uc02 = parseUseCases(readFileSync("data/un-use-cases.csv", "utf8")).useCases.find((u) => u.ext_id === "UC02")!;

test("UAE rule set gives byte-identical decisions to no rule set", () => {
  const gates = Object.keys(GATES) as GateId[];
  const statuses: (GateStatus | undefined)[] = [undefined, "pass", "fail", "fix_declared"];
  const extras: GateId[][] = [[], ["hallucination_rate", "fee_accuracy"]];
  let n = 0;
  for (const clientFacing of [true, false])
    for (const requested of ["GO_AUTONOMOUS", "GO_SUPERVISED", "ASSISTANT_ONLY"] as const)
      for (const extraGates of extras)
        for (const hitlBreaches of [[], ["client_facing_final_approval"]])
          for (let k = 0; k < 4 ** 3; k++) {
            const g: GateState = {};
            gates.slice(0, 5).forEach((id, i) => { const s = statuses[(k >> (i % 3 * 2)) & 3]; if (s && i < 3 + (k % 3)) g[id] = s; });
            gates.slice(5).forEach((id, i) => { const s = statuses[(k + i) & 3]; if (s) g[id] = s; });
            const o = { clientFacing, requested, gates: g, extraGates, hitlBreaches };
            assert.equal(JSON.stringify(decide({ ...o, ruleset: UAE_FEDERAL })), JSON.stringify(decide(o)));
            n++;
          }
  assert.ok(n > 1000);
});

test("UC02 verdicts and gates diverge across jurisdictions", () => {
  const facts = { client_facing: uc02.client_facing, affects_rights: uc02.affects_rights, irreversible: uc02.irreversible };
  const c = compare({ entity: uc02.entity, facts, requested: "GO_AUTONOMOUS", ...s1EvidenceAt("T1") });
  const v = Object.fromEntries(c.rows.map((r) => [r.rs.id, r.decision.verdict]));
  assert.deepEqual(v, { "uae-federal": "NO_GO", "eu-ai-act": "GO_SUPERVISED", "sg-imda": "ESCALATE" });
  assert.ok(c.verdictsDiffer);
  assert.ok(c.gates.some((g) => g.gate === "approved_infrastructure"));
  assert.ok(c.gaps.length >= 3);
  // the same use case treated as rights-affecting is high-risk in the EU and capped even if internal
  const hr = compare({ entity: uc02.entity, facts: { ...facts, affects_rights: true }, requested: "GO_AUTONOMOUS", ...s1EvidenceAt("T4") });
  assert.equal(hr.rows[1].highRisk, true);
  assert.equal(decide({ clientFacing: false, requested: "GO_AUTONOMOUS", gates: s1EvidenceAt("T4").gates, ruleset: hr.rows[1].rs }).verdict, "GO_SUPERVISED");
  assert.equal(s1EvidenceAt("T4").gates.audit_log, "pass");
});

test("every cited chunk id and gap link resolves", () => {
  for (const rs of RULESETS) for (const id of citedChunks(rs)) assert.ok(chunkIds.has(id), `${rs.id}: ${id}`);
  for (const g of DERIVED_GAPS) {
    for (const id of g.chunk_ids) assert.ok(chunkIds.has(id), `${g.id}: ${id}`);
    for (const id of g.relatesTo) assert.ok(gapIds.has(id), `${g.id}: ${id}`);
  }
  for (const rs of RULESETS) for (const id of rs.gapIds) assert.ok(gapIds.has(id));
});

const ucs = parseUseCases(readFileSync("data/un-use-cases.csv", "utf8")).useCases;
const proc = (id: string, rights: boolean, allPass: boolean): ProcessInput => {
  const u = ucs.find((x) => x.ext_id === id)!;
  return { id, entity: u.entity, facts: { client_facing: u.client_facing, affects_rights: rights, irreversible: u.irreversible }, requested: "GO_AUTONOMOUS", gates: flatEvidence(allPass), hitlUnmet: [] };
};

test("compareProcesses: UAE rows equal decide() with no rule set", () => {
  for (const p of [proc("UC02", false, true), proc("UC03", false, false), proc("UC09", true, true)]) {
    const [r] = compareProcesses(UAE_FEDERAL, [p]);
    const plain = decide({ clientFacing: p.facts.client_facing, requested: p.requested, gates: p.gates });
    assert.equal(JSON.stringify(r.decision), JSON.stringify(plain));
    assert.equal(r.uae.verdict, r.decision.verdict);
  }
});

test("compareProcesses: process attributes diverge under one policy; swapping policy changes a row", () => {
  const ps = [proc("UC08", false, true), proc("UC03", false, true), proc("UC09", true, true)]; // client-facing, plain internal, internal + rights
  const uae = compareProcesses(UAE_FEDERAL, ps);
  assert.deepEqual(uae.map((r) => r.decision.verdict), ["GO_SUPERVISED", "GO_AUTONOMOUS", "GO_AUTONOMOUS"]);
  assert.ok(uae[0].required.includes("human_final_approval") && !uae[1].required.includes("human_final_approval"));
  const eu = compareProcesses(EU_AI_ACT, ps);
  assert.equal(eu[2].decision.verdict, "GO_SUPERVISED"); // rights-affecting is high-risk: capped
  assert.ok(eu[2].addedByAttributes.includes("audit_log"));
  assert.notEqual(eu[2].decision.verdict, uae[2].decision.verdict);
  assert.equal(eu[1].decision.verdict, "GO_AUTONOMOUS");
  // Singapore needs the hallucination_rate gate: with no evidence an internal process escalates in every policy
  const sg = compareProcesses(SG_IMDA, [proc("UC03", false, false)]);
  assert.equal(sg[0].decision.verdict, "ESCALATE");
  assert.ok(sg[0].required.includes("hallucination_rate"));
});
