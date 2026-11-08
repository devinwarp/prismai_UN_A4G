import assert from "node:assert/strict";
import test from "node:test";
import { appendTrace, canonical, GENESIS, verifyLog, type Body, type TraceRecord } from "../src/lib/un/trace.ts";

const body = (n: number): Body => ({
  run_id: "r1", step: `T${n}`, agent: "security", role_mandate: "m", inputs_seen: [`e${n}`],
  claims: [{ text: `claim ${n}`, evidence: [`e${n}`] }], kb_citations: [], proposal: null,
  confidence: "high", disposition: "accepted", message: null, derived_from: [], timestamp: "2026-11-08T10:00:00Z",
});
const build = (n: number) => Array.from({ length: n }).reduce<TraceRecord[]>((l, _, i) => appendTrace(l, body(i)), []);

test("canonical JSON ignores key order and undefined", () => {
  assert.equal(canonical({ b: 1, a: [{ d: 1, c: undefined }] }), canonical({ a: [{ c: undefined, d: 1 }], b: 1 }));
});

test("a clean log verifies; the first record chains from genesis", () => {
  const log = build(5);
  assert.equal(log[0].prev_hash, GENESIS);
  assert.deepEqual(verifyLog(log), { ok: true, length: 5, brokenAt: null, reason: null });
  assert.ok(verifyLog([]).ok);
});

test("tampering is detected: edit, delete, insert, reorder, hash swap", () => {
  const log = build(5);
  const edit = structuredClone(log); edit[2].claims[0].text = "forged";
  assert.deepEqual([verifyLog(edit).ok, verifyLog(edit).brokenAt], [false, 2]);
  const del = log.filter((_, i) => i !== 1);
  assert.equal(verifyLog(del).ok, false);
  const ins = [...log.slice(0, 2), log[1], ...log.slice(2)];
  assert.equal(verifyLog(ins).ok, false);
  const re = [log[0], log[2], log[1], ...log.slice(3)];
  assert.equal(verifyLog(re).ok, false);
  const rehash = structuredClone(log); rehash[4].hash = rehash[3].hash;
  assert.equal(verifyLog(rehash).ok, false);
  // truncating the tail is not detectable without an external anchor (see anchorHead)
  assert.ok(verifyLog(log.slice(0, 3)).ok);
});
