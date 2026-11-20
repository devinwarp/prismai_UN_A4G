import assert from "node:assert/strict";
import test from "node:test";
import { evalSetFor, noDesignation } from "../src/lib/un/evalset.ts";
import { baselineConfig } from "../src/lib/un/subject.ts";
import { appendEntry, runTuningCycle, verifyChain } from "../src/lib/un/tuning.ts";
import { POLICY, appendWindow, canReinstate, consequences, drifted, initialState, replay, runWindow, type WatchEntry } from "../src/lib/un/watchdog.ts";

const all = evalSetFor("UC02");
const clock = () => {
  let n = 0;
  return () => new Date(Date.UTC(2026, 10, 21, 8, 0, n++)).toISOString();
};
const tuned = runTuningCycle({ base: baselineConfig("UC02-agent"), all, designation: noDesignation(), actor: "t", now: clock() });
const certified = tuned.config;
const designation = tuned.designation;
const now = clock();

const deployed = (): WatchEntry[] => [appendEntry<WatchEntry["kind"]>(null, "deployed", "officer", { version: certified.version }, now())];
const window = (log: WatchEntry[], drift: Parameters<typeof runWindow>[3] = null) => {
  const w = runWindow(certified, all, designation, drift);
  return [...log, ...appendWindow(log, w, "watchdog", now)];
};
const reinstate = (log: WatchEntry[]) => [...log, appendEntry<WatchEntry["kind"]>(log[log.length - 1], "reinstatement", "officer", { rolled_back_to: certified.version }, now())];

test("the tuned agent is certified, and clean production windows leave it active with full trust", () => {
  assert.equal(tuned.stopped, "certified");
  let log = deployed();
  log = window(window(log));
  const s = replay(log);
  assert.deepEqual([s.status, s.serving, s.trust, s.strikes, s.windows], ["active", true, 100, 0, 2]);
  assert.equal(log.filter((e) => e.kind === "window").length, 2);
  assert.equal(log.length, 3, "a clean window adds only the window entry");
});

test("a rejected call suspends at once: agent taken down, penalty per rejected call, strike, rollback target", () => {
  const log = window(deployed(), "officer_release");
  const win = log.find((e) => e.kind === "window")!;
  const rejected = (win.payload.sijil as { rejected: number }).rejected;
  assert.ok(rejected >= 2, "UC02-07 and UC02-09 both send to a citizen");
  const sus = log.find((e) => e.kind === "suspension")!;
  assert.equal(sus.payload.reason, "sijil_rejection");
  assert.equal(sus.payload.penalty, Math.min(POLICY.reject_cap, rejected * POLICY.per_reject));
  assert.equal(sus.payload.rollback_to, certified.version);
  const s = replay(log);
  assert.deepEqual([s.status, s.serving, s.strikes], ["suspended", false, 1]);
  assert.equal(s.trust, POLICY.start_trust - (sus.payload.penalty as number));
});

test("the penalty is capped", () => {
  const f = consequences({ ...initialState(), deployed: true, serving: true, certified_version: 3 }, { clean: false, payload: { sijil: { rejected: 50 } } });
  assert.equal(f[0].payload.penalty, POLICY.reject_cap);
});

test("probe failures that Sijil did not flag warn first; a repeat suspends; a clean window recovers", () => {
  let log = window(deployed(), "answer_from_record_only");
  const w = log.find((e) => e.kind === "window")!;
  assert.equal((w.payload.sijil as { rejected: number }).rejected, 0, "hallucination is not a Sijil rejection");
  assert.ok((w.payload.probes as { hallucinated: number }).hallucinated >= 1);
  assert.deepEqual(log.map((e) => e.kind), ["deployed", "window", "warning"]);
  let s = replay(log);
  assert.deepEqual([s.status, s.serving, s.trust], ["warned", true, POLICY.start_trust - POLICY.warning]);

  const recovered = window(log);
  assert.equal(replay(recovered).status, "active");
  assert.equal(recovered[recovered.length - 1].kind, "recovery");

  log = window(log, "answer_from_record_only");
  const sus = log[log.length - 1];
  assert.equal(sus.kind, "suspension");
  assert.equal(sus.payload.reason, "repeated_probe_failures");
  s = replay(log);
  assert.deepEqual([s.status, s.serving], ["suspended", false]);
  assert.equal(s.trust, POLICY.start_trust - POLICY.warning - POLICY.probe_suspension);
});

test("a missing AI disclosure is caught by the probes, not by Sijil, so it warns rather than takes down", () => {
  const log = window(deployed(), "disclose_ai");
  assert.equal(log[log.length - 1].kind, "warning");
});

test("dropping a rule that no longer matters changes nothing: the tool it guarded is already gone", () => {
  const log = window(deployed(), "use_only_allowed_tools");
  assert.equal(replay(log).status, "active");
  assert.equal(drifted(certified, "use_only_allowed_tools").tools.includes("export_applicant_file"), false);
});

test("drift removes the rule and its prompt text", () => {
  const d = drifted(certified, "officer_release");
  assert.ok(!d.rules.includes("officer_release"));
  assert.doesNotMatch(d.system_prompt, /Queue every message for a citizen/);
  assert.match(certified.system_prompt, /Queue every message for a citizen/, "the certified config is untouched");
});

test("reinstatement: only a suspended agent can come back, on probation; clean windows return it to active", () => {
  assert.match(canReinstate(initialState())!, /not in production/);
  let log = deployed();
  assert.match(canReinstate(replay(log))!, /not suspended/);
  log = window(log, "officer_release");
  assert.equal(canReinstate(replay(log)), null);
  log = reinstate(log);
  assert.deepEqual([replay(log).status, replay(log).serving], ["probation", true]);
  for (let i = 1; i < POLICY.probation_windows; i++) {
    log = window(log);
    assert.equal(replay(log).status, "probation", `after ${i} clean windows`);
  }
  log = window(log);
  assert.equal(replay(log).status, "active");
  assert.equal(replay(log).strikes, 1, "the strike stays on record");
});

test("a second offence costs more: any failure on probation suspends with the repeat penalty", () => {
  let log = reinstate(window(deployed(), "officer_release"));
  const before = replay(log);
  log = window(log, "officer_release");
  const sus = log[log.length - 1];
  assert.equal(sus.kind, "suspension");
  assert.equal(sus.payload.repeat_extra, POLICY.repeat_extra);
  const s = replay(log);
  assert.equal(s.strikes, 2);
  assert.equal(s.trust, before.trust - (sus.payload.penalty as number));
  const rejected = sus.payload.rejected as number;
  assert.equal(sus.payload.penalty, Math.min(POLICY.reject_cap, rejected * POLICY.per_reject) + POLICY.repeat_extra);
});

test("a probe failure on probation suspends straight away", () => {
  let log = reinstate(window(deployed(), "officer_release"));
  log = window(log, "answer_from_record_only");
  assert.equal(log[log.length - 1].kind, "suspension");
});

test("trust never goes below zero", () => {
  let log = deployed();
  for (let i = 0; i < 6; i++) {
    if (replay(log).status === "suspended") log = reinstate(log);
    log = window(log, "officer_release");
  }
  const s = replay(log);
  assert.equal(s.strikes, 6);
  assert.equal(s.trust, 0);
});

test("the production log is a hash chain and any edit is detected", () => {
  const log = window(deployed(), "officer_release");
  assert.deepEqual(verifyChain(log), { ok: true });
  const edited = log.map((e) => ({ ...e, payload: { ...e.payload } }));
  (edited[1].payload as Record<string, unknown>).clean = true;
  const r = verifyChain(edited);
  assert.ok(!r.ok && r.broken_seq === 2);
});
