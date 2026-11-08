import assert from "node:assert/strict";
import test from "node:test";
import {
  computeDashboard,
  DEFAULT_POLICY,
  isUuid,
  parseCsv,
  parseUseCases,
  type UnUseCaseState,
} from "../src/lib/un/model.ts";

const HEAD = "id,entity,use_case,quadrant,client_facing\n";

test("parseCsv handles quotes, escaped quotes, CRLF and BOM", () => {
  assert.deepEqual(parseCsv('﻿a,"b,1","c ""x"""\r\nd,e,f\r\n'), [
    ["a", "b,1", 'c "x"'],
    ["d", "e", "f"],
  ]);
});

test("parseUseCases maps by header, any column order", () => {
  const r = parseUseCases(
    "quadrant,use_case,entity,id,client_facing\nexternal agents,Voice,Marsa,UC01,yes\n",
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.useCases[0].quadrant, "External Agents");
  assert.equal(r.useCases[0].client_facing, true);
});

test("parseUseCases is all-or-nothing and names the bad line", () => {
  const r = parseUseCases(HEAD + "UC01,Marsa,A,Internal Agents,no\nUC01,Marsa,B,Nope,no\n");
  assert.equal(r.useCases.length, 0);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors.join(), /Line 3: duplicate id UC01/);
  assert.match(r.errors.join(), /Line 3: quadrant "Nope"/);
});

test("parseUseCases rejects a file missing required columns", () => {
  assert.match(parseUseCases("id,entity\nUC01,x\n").errors[0], /Missing columns: use_case, quadrant/);
});

const uc = (id: string, entity: string, verdict: UnUseCaseState["verdict"], compliant: boolean): UnUseCaseState => ({
  id, ext_id: id, entity, entity_sector: null, title: id, quadrant: "Internal Agents",
  matrix_examples: null, departments: null, client_facing: false, hitl_rule: null,
  description: null, stage: "intake", verdict, compliant,
});

test("dashboard: deployed and compliant are separate; target rounds up", () => {
  const ucs = [
    uc("1", "A", "GO_SUPERVISED", true),
    uc("2", "A", "GO_AUTONOMOUS", false), // deployed but fails attestation
    uc("3", "B", "ASSISTANT_ONLY", true), // does not count
    uc("4", "B", null, false),
    uc("5", "B", null, false),
  ];
  const d = computeDashboard(DEFAULT_POLICY, ucs);
  assert.equal(d.targetCount, 3); // ceil(5 * 50%)
  assert.equal(d.deployed, 2);
  assert.equal(d.compliant, 1);
  assert.equal(d.deployedPct, 40);
  assert.equal(d.compliantPct, 20);
  assert.equal(d.gap, 1);
  assert.deepEqual(d.byEntity.find((t) => t.key === "A"), { key: "A", total: 2, deployed: 2, compliant: 1 });
});

test("dashboard: counting rule is configurable", () => {
  const ucs = [uc("1", "A", "ASSISTANT_ONLY", true)];
  const d = computeDashboard({ ...DEFAULT_POLICY, counting_verdicts: ["ASSISTANT_ONLY"] }, ucs);
  assert.equal(d.deployed, 1);
  assert.equal(computeDashboard(DEFAULT_POLICY, []).deployedPct, 0);
});

test("isUuid accepts uuids and rejects other route ids", () => {
  assert.equal(isUuid("4c97848d-d53d-47ba-94ea-24c154be8c98"), true);
  assert.equal(isUuid("abc"), false);
  assert.equal(isUuid("4c97848d-d53d-47ba-94ea-24c154be8c98x"), false);
});

test("parseUseCases rejects unrecognised yes/no values instead of reading them as no", () => {
  const r = parseUseCases("id,entity,use_case,quadrant,client_facing\nUC1,E,T,Internal RAG,maybe\nUC2,E,T,Internal RAG,Yes\nUC3,E,T,Internal RAG,\n");
  assert.deepEqual(r.errors, ['Line 2: client_facing "maybe" must be yes or no.']);
});
