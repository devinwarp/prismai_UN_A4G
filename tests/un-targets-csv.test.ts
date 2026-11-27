import assert from "node:assert/strict";
import test from "node:test";
import { ENTITY_GOALS } from "../src/lib/un/goals.ts";
import { checkTargets, parseTargetsCsv, TARGET_COLUMNS } from "../src/lib/un/targets-csv.ts";

const goals = ENTITY_GOALS["Marsa Public Services Authority"];
const HEAD = "use_case_id,id,kind,goal_id,statement,comparator,value,unit,measured_by,evidence,param_key,check_criterion,check_scope";
const ROW = (over: Record<string, string> = {}) => {
  const v: Record<string, string> = { use_case_id: "UC09", id: "T1", kind: "outcome", goal_id: "MARSA-G1", statement: "Acknowledge every application", comparator: "min", value: "95", unit: "percent", measured_by: "go_live", evidence: "portal timestamps, monthly", param_key: "", check_criterion: "", check_scope: "", ...over };
  return HEAD.split(",").map((k) => (/[,"]/.test(v[k]) ? `"${v[k].replace(/"/g, '""')}"` : v[k])).join(",");
};
const file = (...rows: string[]) => [HEAD, ...rows].join("\n");
const entityOf = (id: string) => (id === "UC09" || id === "UC10" ? "Marsa Public Services Authority" : undefined);
const goalsOf = () => goals;

test("a targets file parses into proposals per use case, in file order", () => {
  const r = parseTargetsCsv(file(ROW(), ROW({ id: "T2", kind: "control", goal_id: "", statement: "A person approves every offer", comparator: "min", value: "100", measured_by: "pilot", evidence: "per-test check", check_criterion: "human_final_approval", check_scope: "client_facing" }), ROW({ use_case_id: "UC10", id: "T1" })));
  assert.deepEqual(r.errors, []);
  assert.deepEqual([...r.byUseCase.keys()], ["UC09", "UC10"]);
  const uc09 = r.byUseCase.get("UC09")!;
  assert.deepEqual(uc09.map((t) => t.id), ["T1", "T2"]);
  assert.equal(uc09[0].value, 95);
  assert.equal(uc09[0].goal_id, "MARSA-G1");
  assert.equal(uc09[1].goal_id, undefined);
  assert.deepEqual(uc09[1].check, { criterion: "human_final_approval", scope: "client_facing" });
  assert.deepEqual(checkTargets(r.byUseCase, entityOf, goalsOf), []);
});

test("column order is free and quoted cells keep their commas", () => {
  const cols = ["evidence", "statement", "use_case_id", "id", "goal_id", "comparator", "value", "unit", "measured_by"];
  const text = `${cols.join(",")}\n"survey, monthly","Candidate satisfaction, overall",UC09,T1,MARSA-G1,min,90,percent,go_live`;
  const r = parseTargetsCsv(text);
  assert.deepEqual(r.errors, []);
  assert.equal(r.byUseCase.get("UC09")![0].statement, "Candidate satisfaction, overall");
  assert.equal(r.byUseCase.get("UC09")![0].evidence, "survey, monthly");
});

test("a missing or unknown column stops the file before any row is read", () => {
  assert.match(parseTargetsCsv("use_case_id,id\nUC09,T1").errors[0], /missing columns: statement, comparator, value, unit, measured_by, evidence/);
  assert.match(parseTargetsCsv(`${HEAD},colour\n`).errors[0], /unknown column: colour/);
  assert.match(parseTargetsCsv("").errors[0], /empty/);
});

test("a row without a use case, or a half-given check, is reported by line", () => {
  assert.match(parseTargetsCsv(file(ROW({ use_case_id: "" }))).errors.join(" "), /Targets line 2: use_case_id is empty/);
  assert.match(parseTargetsCsv(file(ROW({ check_scope: "all" }))).errors.join(" "), /check_scope needs a check_criterion/);
  assert.match(parseTargetsCsv(file(ROW({ check_criterion: "vibes" }))).errors.join(" "), /check_criterion must be one of/);
  assert.match(parseTargetsCsv(file(ROW({ check_criterion: "accuracy", check_scope: "some" }))).errors.join(" "), /check_scope must be one of/);
});

test("all-or-nothing: one bad row means no use case is returned", () => {
  const r = parseTargetsCsv(file(ROW(), ROW({ use_case_id: "" })));
  assert.equal(r.byUseCase.size, 0);
  assert.equal(r.errors.length, 1);
});

test("checkTargets applies the targets rules against the entity's goals and names the use case", () => {
  const e = (text: string, of = entityOf) => checkTargets(parseTargetsCsv(text).byUseCase, of, goalsOf).join(" | ");
  assert.match(e(file(ROW({ goal_id: "OTHER-G9" }))), /Targets for UC09: Target 1: goal OTHER-G9 is not a goal of this entity/);
  assert.match(e(file(ROW({ kind: "control", goal_id: "MARSA-G1" }))), /a control target is not linked to a goal/);
  assert.match(e(file(ROW({ value: "140" }))), /a percentage cannot be above 100/);
  assert.match(e(file(ROW({ value: "" }))), /value must be a number/);
  assert.match(e(file(ROW({ use_case_id: "UC77" }))), /Targets for UC77: no use case with this id/);
  assert.match(e(file(ROW(), ROW())), /id T1 is used twice/);
  assert.match(e(file(ROW({ measured_by: "go_live", check_criterion: "accuracy", check_scope: "all" }))), /go-live target cannot be checked per test/);
});

test("the column list documents every column the parser reads", () => {
  assert.deepEqual(TARGET_COLUMNS.map((c) => c.name), HEAD.split(","));
  assert.equal(TARGET_COLUMNS.filter((c) => c.required).length, 8);
});
