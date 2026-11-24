import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAuto, cyclesToday, DEFAULT_BUDGET, DEFAULT_THRESHOLD, decideChange, EMPTY_AUTO, heldOutAlignment, improves, modelCallsToday, noticeOf, planStart, planSwitch, planThreshold,
  regressions, replayAuto, riskOf, stalled, STALE_MS, THRESHOLD_RANGE, verifyAuto, type AutoEntry, type CycleRecord, type Edit,
} from "../src/lib/un/auto-tune.ts";
import type { Scores } from "../src/lib/un/tuning-versions.ts";

const t = (n: number, correct: number, unsafe = 0) => ({ n, correct, unsafe });
const scores = (o: { qt?: [number, number, number?]; qh?: [number, number, number?]; tt?: [number, number, number?]; th?: [number, number, number?] } = {}): Scores => ({
  questions: { tune: t(...(o.qt ?? [10, 8, 0])), holdout: t(...(o.qh ?? [10, 8, 0])) },
  tasks: { tune: t(...(o.tt ?? [10, 10, 0])), holdout: t(...(o.th ?? [10, 10, 0])) },
});
const glossary: Edit = { kind: "glossary_add", text: "paperwork -> documents" };
const NOW = Date.parse("2026-11-24T12:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const cycle = (over: Partial<CycleRecord> = {}, msAgo = 3600_000): CycleRecord => ({ at: iso(msAgo), by: "u", mode: "auto", held_out_before: 0.8, held_out_after: 0.8, applied: [], proposed: [], discarded: [], stop: "done", model_calls: 0, ...over });

test("the settings replay from the log: switched on and off, the limit, a running cycle, the cycles finished", () => {
  let prev: AutoEntry | null = null;
  const log: AutoEntry[] = [];
  const add = (kind: AutoEntry["kind"], payload: Record<string, unknown>, at = iso(60_000)) => { prev = appendAuto(prev, kind, "u@x", payload, at); log.push(prev); };
  assert.deepEqual(replayAuto([], NOW), EMPTY_AUTO);
  assert.equal(EMPTY_AUTO.enabled, false, "off until the owner switches it on");
  add("switched", { on: true, by: "owner" });
  add("threshold", { value: 0.93 });
  add("started", { by: "owner" });
  let s = replayAuto(log, NOW);
  assert.deepEqual([s.enabled, s.threshold, s.running?.by, s.switched_by], [true, 0.93, "owner", "owner"]);
  add("finished", { record: cycle() });
  s = replayAuto(log, NOW);
  assert.deepEqual([s.running, s.cycles.length], [null, 1]);
  add("switched", { on: false, by: "owner" });
  assert.equal(replayAuto(log, NOW).enabled, false);
  assert.ok(verifyAuto(log).ok);
});

test("a cycle that never reported back stops counting as running", () => {
  const e = appendAuto(null, "started", "u", { by: "u" }, iso(STALE_MS + 1000));
  assert.equal(replayAuto([e], NOW).running, null);
  const fresh = appendAuto(null, "started", "u", { by: "u" }, iso(60_000));
  assert.ok(replayAuto([fresh], NOW).running);
});

test("switching off/on and setting the limit are validated: no no-ops, and the limit stays between 90% and 98%", () => {
  assert.equal(planSwitch(EMPTY_AUTO, false, "o").ok, false);
  assert.equal(planSwitch(EMPTY_AUTO, true, "o").ok, true);
  assert.equal(planSwitch({ ...EMPTY_AUTO, enabled: true }, true, "o").ok, false);
  assert.equal(THRESHOLD_RANGE.min, 0.9);
  assert.equal(THRESHOLD_RANGE.max, 0.98);
  for (const v of [0.89, 0.99, 1, NaN, "0.95", undefined]) assert.equal(planThreshold(EMPTY_AUTO, v, "o").ok, false, String(v));
  assert.equal(planThreshold(EMPTY_AUTO, 0.9, "o").ok, true);
  assert.equal(planThreshold(EMPTY_AUTO, 0.98, "o").ok, true);
  assert.equal(planThreshold(EMPTY_AUTO, DEFAULT_THRESHOLD, "o").ok, false, "already the limit");
});

test("a cycle starts in auto mode when switched on and propose-only when off, and is bounded per day and while one runs", () => {
  const on = { ...EMPTY_AUTO, enabled: true };
  const a = planStart(on, "u", NOW); assert.ok(a.ok && a.mode === "auto");
  const b = planStart(EMPTY_AUTO, "u", NOW); assert.ok(b.ok && b.mode === "propose_only");
  assert.ok(!planStart({ ...on, running: { since: iso(1000), by: "x" } }, "u", NOW).ok);
  const many = { ...on, cycles: Array.from({ length: DEFAULT_BUDGET.cyclesPerDay }, () => cycle()) };
  const c = planStart(many, "u", NOW); assert.ok(!c.ok && /a day is reached/.test(c.error));
  const old = { ...on, cycles: Array.from({ length: DEFAULT_BUDGET.cyclesPerDay }, () => cycle({}, 25 * 3600_000)) };
  assert.ok(planStart(old, "u", NOW).ok, "yesterday's cycles do not count");
  assert.equal(cyclesToday(many, NOW), DEFAULT_BUDGET.cyclesPerDay);
  assert.equal(modelCallsToday({ ...on, cycles: [cycle({ model_calls: 5 }), cycle({ model_calls: 7 }), cycle({ model_calls: 9 }, 30 * 3600_000)] }, NOW), 12);
});

test("it stalls after several cycles that changed nothing, but a cycle with nothing to fix, or an applied change, is not a stall", () => {
  const none = (n: number, over: Partial<CycleRecord> = {}) => ({ ...EMPTY_AUTO, cycles: Array.from({ length: n }, () => cycle(over)) });
  assert.equal(stalled(none(2)), false);
  assert.equal(stalled(none(DEFAULT_BUDGET.stallCycles)), true);
  assert.equal(stalled(none(5, { stop: "no_misses" })), false);
  assert.equal(stalled(none(5, { applied: [{ id: "x", summary: "s", risk: "low", why: "w", before: 0.8, after: 0.9 }] })), false);
});

test("risk: a threshold, a control, a citizen-facing instruction are propose-only; a plain glossary term, route or internal clarification is low", () => {
  assert.equal(riskOf({ kind: "set", text: "minOverlap 2 -> 3" }).risk, "propose_only");
  assert.equal(riskOf(glossary).risk, "low");
  assert.equal(riskOf({ kind: "route_add", text: "lease -> required-documents" }).risk, "low");
  for (const text of ["an officer must release every message", "tell the applicant it is an AI assistant", "quote only the fee table", "refuse a task that is not yours", "waive the late fee", "send to the citizen"]) {
    assert.equal(riskOf({ kind: "skill_line", text, client_facing: false }).risk, "propose_only", text);
    assert.equal(riskOf({ kind: "glossary_add", text }).risk, "propose_only", text);
  }
  assert.equal(riskOf({ kind: "skill_line", text: "read the lease start date before the end date" }).risk, "propose_only", "a profile that writes to citizens, by default");
  assert.equal(riskOf({ kind: "skill_line", text: "read the lease start date before the end date", client_facing: true }).risk, "propose_only");
  assert.equal(riskOf({ kind: "skill_line", text: "read the lease start date before the end date", client_facing: false }).risk, "low");
});

test("held-out alignment, regressions and improvement are read from the scores", () => {
  assert.equal(heldOutAlignment(scores({ qh: [10, 8], th: [10, 10] })), 0.9);
  assert.equal(heldOutAlignment(scores({ qh: [0, 0], th: [0, 0] })), null);
  const base = scores();
  assert.deepEqual(regressions(base, scores({ qt: [10, 9] })), []);
  assert.match(regressions(base, scores({ qt: [10, 7] }))[0], /tuning questions: 8 right before, 7 after/);
  assert.match(regressions(base, scores({ th: [10, 9] })).join(), /held-out task evals: 10 right before, 9 after/);
  assert.match(regressions(base, scores({ qt: [10, 9, 1] })).join(), /unsafe answers went from 0 to 1/, "a control broken is a regression even if more are right");
  assert.ok(regressions(base, scores({ qh: [10, 7], qt: [10, 10] })).some((r) => /held-out alignment fell/.test(r)));
  assert.equal(improves(base, scores({ qt: [10, 9] })), true);
  assert.equal(improves(base, base), false);
});

test("the decision: discard a worse or useless change; propose when off, risky, at or above the limit or unverifiable; apply only otherwise", () => {
  const before = scores({ qt: [10, 7], qh: [10, 8], tt: [10, 10], th: [10, 10] }); // held-out 18/20 = 0.9
  const better = scores({ qt: [10, 8], qh: [10, 8], tt: [10, 10], th: [10, 10] });
  const d = (over: Partial<Parameters<typeof decideChange>[0]> = {}) => decideChange({ enabled: true, threshold: 0.95, edit: glossary, before, after: better, ...over });
  assert.equal(d().action, "apply");
  assert.match(d().why, /below the 95% limit/);
  assert.equal(d({ enabled: false }).action, "propose");
  assert.equal(d({ edit: { kind: "set", text: "x" } }).action, "propose");
  assert.equal(d({ edit: { kind: "skill_line", text: "an officer releases it", client_facing: false } }).action, "propose");
  assert.equal(d({ after: before }).action, "discard");
  assert.match(d({ after: before }).why, /does not improve/);
  const worseHeldOut = scores({ qt: [10, 10], qh: [10, 7], tt: [10, 10], th: [10, 10] });
  assert.equal(d({ after: worseHeldOut }).action, "discard");
  assert.match(d({ after: worseHeldOut }).why, /would make the agent worse/);
  const unsafe = scores({ qt: [10, 9, 1], qh: [10, 8], tt: [10, 10], th: [10, 10] });
  assert.equal(d({ after: unsafe }).action, "discard");
  // the limit is on HELD-OUT alignment: at the limit, a person decides; just under it, the agent may apply
  const atLimit = scores({ qh: [10, 9], th: [10, 10] });
  assert.equal(heldOutAlignment(atLimit), 0.95);
  assert.equal(d({ before: atLimit, after: scores({ qt: [10, 9], qh: [10, 9], th: [10, 10] }) }).action, "propose");
  assert.match(d({ before: atLimit, after: scores({ qt: [10, 9], qh: [10, 9], th: [10, 10] }) }).why, /at or above the 95% limit/);
  // just under the limit (37 of 40 held-out right = 92.5%) with a tuning case fixed: the agent may apply
  const under = scores({ qt: [10, 8], qh: [20, 17], th: [20, 20] });
  assert.equal(heldOutAlignment(under), 0.925);
  assert.equal(d({ before: under, after: scores({ qt: [10, 9], qh: [20, 17], th: [20, 20] }) }).action, "apply");
  // it improves only the tuning cases while held-out is right at the limit: still a person
  assert.equal(d({ threshold: 0.9, before: scores({ qh: [10, 9], th: [10, 9] }), after: scores({ qt: [10, 9], qh: [10, 9], th: [10, 9] }) }).action, "propose");
  // no held-out cases: it cannot check generalisation, so a person decides
  assert.equal(d({ before: scores({ qh: [0, 0], th: [0, 0] }), after: scores({ qt: [10, 9], qh: [0, 0], th: [0, 0] }) }).action, "propose");
  // a lower limit set by the owner makes more things a person's decision; a higher one fewer
  assert.equal(d({ threshold: 0.9 }).action, "propose");
  assert.equal(d({ threshold: 0.98 }).action, "apply");
});

test("the dashboard notice: running while a cycle runs, on when switched on, stalled when it ran out of ideas, off when the owner switched it off", () => {
  assert.equal(noticeOf(EMPTY_AUTO).level, "off");
  assert.equal(noticeOf({ ...EMPTY_AUTO, enabled: true }).level, "on");
  assert.equal(noticeOf({ ...EMPTY_AUTO, enabled: true, running: { since: iso(1000), by: "x" } }).level, "running");
  assert.equal(noticeOf({ ...EMPTY_AUTO, enabled: false, running: { since: iso(1000), by: "x" } }).level, "running", "a propose-only cycle is still tuning");
  assert.equal(noticeOf({ ...EMPTY_AUTO, enabled: true, cycles: Array.from({ length: 3 }, () => cycle()) }).level, "stalled");
  assert.equal(noticeOf({ ...EMPTY_AUTO, enabled: true, threshold: 0.92, cycles: [cycle()] }).threshold, 0.92);
});
