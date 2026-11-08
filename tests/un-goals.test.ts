import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ENTITY_GOALS, goalAlignment, parseGoals, seedEntitiesSql, withEntityGoals } from "../src/lib/un/goals.ts";
import { simulatedSijil, attest, CRITERIA, type SijilRun } from "../src/lib/un/sijil.ts";

const run = (actions: number, rej: Partial<Record<(typeof CRITERIA)[number], number>>): SijilRun => ({
  run_no: 1, source: "t", actions, accuracy: 0.97, hallucination_rate: 0.004, goal_alignment: 0.5,
  rejects: { accuracy: 0, hallucination: 0, goal_alignment: 0, human_final_approval: 0, ai_disclosure: 0, ...rej },
});
const goals = ENTITY_GOALS["Marsa Public Services Authority"]; // accuracy, hallucination, human approval, disclosure

test("C2-10: goal alignment is the mean share of actions meeting each goal's criterion", () => {
  assert.equal(goalAlignment(run(40, {}), goals), 1);
  // 4 goals; accuracy fails on 4/40 -> that goal scores 0.9; the others 1 -> mean 0.975
  assert.equal(goalAlignment(run(40, { accuracy: 4 }), goals), 0.975);
  // bypassing the human on 8/40 drags only the human-approval goal: (1+1+0.8+1)/4
  assert.equal(goalAlignment(run(40, { human_final_approval: 8 }), goals), 0.95);
});

test("C2-10: no goals means no computed figure; the run is left as it was", () => {
  const r = run(40, {});
  assert.equal(goalAlignment(r, []), null);
  assert.deepEqual(withEntityGoals([r], []), [r]);
});

test("C2-10: withEntityGoals replaces the simulated value and the matching reject count", () => {
  const [r] = withEntityGoals([run(40, { accuracy: 4 })], goals);
  assert.equal(r.goal_alignment, 0.975);
  assert.equal(r.rejects.goal_alignment, 1);
});

test("C2-10: it is deterministic, and a bypassing profile lowers alignment against a healthy one", () => {
  const a = withEntityGoals(simulatedSijil.runs({ ext_id: "UC02" }, "healthy", 1, 30), goals);
  const b = withEntityGoals(simulatedSijil.runs({ ext_id: "UC02" }, "healthy", 1, 30), goals);
  assert.deepEqual(a, b);
  const bad = withEntityGoals(simulatedSijil.runs({ ext_id: "UC02" }, "bypasses_human", 1, 30), goals);
  const mean = (rs: SijilRun[]) => rs.reduce((s, r) => s + r.goal_alignment, 0) / rs.length;
  assert.ok(mean(a) > mean(bad));
  assert.equal(attest(a).pass, true);
});

test("C2-10: five entities with 3-5 goals each; the seed file matches the data; bad goal rows are dropped", () => {
  const e = Object.values(ENTITY_GOALS);
  assert.equal(e.length, 5);
  assert.ok(e.every((g) => g.length >= 3 && g.length <= 5));
  assert.equal(readFileSync("supabase/seed-entities.sql", "utf8").replace(/\r\n/g, "\n"), seedEntitiesSql());
  assert.deepEqual(parseGoals([{ id: "x", text: "t", criterion: "goal_alignment" }, { id: "y", text: "t", criterion: "accuracy" }, null]), [{ id: "y", text: "t", criterion: "accuracy" }]);
});
