import assert from "node:assert/strict";
import test from "node:test";
import { sijilIntegrated, withAlignment } from "../src/lib/un/alignment.ts";
import { computeDashboard, DEFAULT_POLICY, type UnUseCaseState } from "../src/lib/un/model.ts";

const uc = (id: string, verdict: UnUseCaseState["verdict"], compliant: boolean) => ({
  id, ext_id: id, entity: "E", entity_sector: null, title: "t", quadrant: "External Agents", matrix_examples: null, departments: null,
  client_facing: false, hitl_rule: null, description: null, stage: "intake", verdict, compliant,
}) as unknown as UnUseCaseState;

test("until Sijil is integrated every use case reads as aligned, with no attestation, and nothing else changes", () => {
  delete process.env.SIJIL_INTEGRATED;
  assert.equal(sijilIntegrated(), false);
  const stored = uc("A", "GO_SUPERVISED", false);
  const read = withAlignment(stored);
  assert.equal(read.compliant, true);
  assert.equal(stored.compliant, false, "the stored use case is not mutated");
  assert.equal(read.verdict, "GO_SUPERVISED");
  const d = computeDashboard(DEFAULT_POLICY, [uc("A", "GO_SUPERVISED", false), uc("B", null, false)].map(withAlignment));
  assert.equal(d.aligned, d.deployed, "every deployed use case is aligned");
});

test("with Sijil integrated the stored attestation decides again", () => {
  process.env.SIJIL_INTEGRATED = "1";
  try {
    assert.equal(sijilIntegrated(), true);
    assert.equal(withAlignment(uc("A", "GO_SUPERVISED", false)).compliant, false);
    assert.equal(withAlignment(uc("B", "GO_SUPERVISED", true)).compliant, true);
  } finally { delete process.env.SIJIL_INTEGRATED; }
});
