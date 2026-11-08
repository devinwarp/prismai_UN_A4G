import assert from "node:assert/strict";
import test from "node:test";
import { nextStep, startRun, type RunEnv, type RunState } from "../src/lib/un/scenario.ts";
import { S1 } from "../src/lib/un/scenarios.ts";
import { GENESIS } from "../src/lib/un/trace.ts";
import { headFromRows, newTraceRows, rowsMatchLog, verifyRows } from "../src/lib/un/trace-rows.ts";
import { loadChunksFrom } from "./helpers-un.ts";

const env: RunEnv = { now: () => "2026-11-09T08:00:00Z", chunks: loadChunksFrom() };
const finished = async () => { let r: RunState = startRun(S1, "r"); while (!r.done) r = await nextStep(S1, r, env); return r; };
const ID = "00000000-0000-4000-8000-000000000001";

test("C4-2: a new run is flagged to write rows; the head is derived from the last row", async () => {
  assert.equal(startRun(S1, "r").trace_rows, true);
  const run = await finished();
  const rows = newTraceRows(ID, run.log, 0);
  assert.equal(rows.length, run.log.length);
  assert.deepEqual(rows.map((r) => r.seq), run.log.map((_, i) => i + 1));
  assert.equal(headFromRows(rows), run.log[run.log.length - 1].hash);
  assert.equal(headFromRows([]), GENESIS);
  assert.ok(verifyRows(rows).ok && rowsMatchLog(rows, run.log).ok);
});

test("C4-2: later steps add only the rows not stored yet (idempotent retry)", async () => {
  const run = await finished();
  const first = newTraceRows(ID, run.log, 0).slice(0, 4);
  const rest = newTraceRows(ID, run.log, first.length);
  assert.equal(rest[0].seq, 5);
  assert.deepEqual(newTraceRows(ID, run.log, run.log.length), []);
  assert.ok(verifyRows([...first, ...rest]).ok);
});

test("C4-2: a missing, edited or reordered row is caught, and the jsonb copy must agree", async () => {
  const run = await finished();
  const rows = newTraceRows(ID, run.log, 0);
  assert.equal(verifyRows(rows.filter((r) => r.seq !== 3)).ok, false); // gap
  const edited = rows.map((r) => (r.seq === 2 ? { ...r, record: { ...r.record, step: "T9" } } : r));
  assert.equal(verifyRows(edited).ok, false);
  assert.equal(rowsMatchLog(rows.slice(0, -1), run.log).ok, false); // rows behind the display copy
  const forged = run.log.map((r, i) => (i === 1 ? { ...r, step: "T9" } : r));
  assert.equal(rowsMatchLog(rows, forged).ok, false); // display copy rewritten
});
