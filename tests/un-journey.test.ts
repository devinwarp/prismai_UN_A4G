import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AR } from "../src/lib/un/i18n/dict.ts";
import { GROUPS, REASON_EN, STAGE_IDS, journeyStatus, stageRules, type JourneyInput, type StageId } from "../src/lib/un/journey.ts";
import { appendEntry, type LogEntry } from "../src/lib/un/tuning.ts";
import { appendWindow, runWindow, type WatchEntry } from "../src/lib/un/watchdog.ts";
import { baselineConfig } from "../src/lib/un/subject.ts";
import { evalSetFor, noDesignation } from "../src/lib/un/evalset.ts";

const sop = { attached: true, profiles: 4, ticked: 2, kbOk: true, skills: 2 };
const base = (o: Partial<JourneyInput> = {}): JourneyInput => ({ sop, gates: null, verdict: null, tests: { ticked: 2, ready: 0 }, pilot: { ticked: 2, run: 0, met: 0 }, evalSet: true, evalRuns: 0, evalMet: null, tuning: [], watch: [], ...o });
// each stage on its own records (the order control is tested at the end)
const at = (i: JourneyInput, id: StageId) => stageRules(i)[id];
const ordered = (i: JourneyInput, id: StageId) => { const s = journeyStatus(i).stages.find((x) => x.id === id)!; return [s.state, s.reason]; };
let n = 0;
const T = () => new Date(Date.UTC(2026, 10, 21, 9, 0, n++)).toISOString();
const log = <K extends string>(prev: { seq: number; hash: string; kind: K }[], kind: K, payload: Record<string, unknown>) =>
  [...prev, appendEntry(prev[prev.length - 1] as never, kind, "p", payload, T())] as never;
const certified = (): LogEntry[] => log([], "certification", { met: true, version: 2 });
const approved = (): LogEntry[] => log(certified(), "approval", { decision: "SIGN", version: 2, signer: "p" });
const deployed = (): WatchEntry[] => log([], "deployed", { version: 2 });

test("nine stages in five groups, in order", () => {
  const j = journeyStatus(base());
  assert.deepEqual(j.stages.map((s) => s.id), [...STAGE_IDS]);
  assert.deepEqual(GROUPS.map((g) => j.stages.filter((s) => s.group === g).map((s) => s.n)), [[1, 2], [3, 4], [5, 6, 7], [8], [9]]);
});

test("stage 1 SOP intake: attach, tick, knowledge base, skills", () => {
  assert.deepEqual(at(base({ sop: { ...sop, attached: false, ticked: 0, skills: 0 } }), "sop"), ["needs_you", "attach_sop"]);
  assert.deepEqual(at(base({ sop: { ...sop, ticked: 0, skills: 0 } }), "sop"), ["needs_you", "tick_profile"]);
  assert.deepEqual(at(base({ sop: { ...sop, kbOk: false } }), "sop"), ["needs_you", "kb_missing"]);
  assert.deepEqual(at(base({ sop: { ...sop, skills: 1 } }), "sop"), ["needs_you", "skill_missing"]);
  assert.deepEqual(at(base(), "sop"), ["done", null]);
});

test("stage 2 Risk and gates: not yet without stage 1 or without the gates adapter; then needs you, then done", () => {
  assert.deepEqual(at(base({ sop: { ...sop, ticked: 0, skills: 0 }, gates: { accepted: true } }), "gates"), ["not_yet", "after_sop"]);
  assert.deepEqual(at(base(), "gates"), ["not_yet", "gates_unbuilt"]);
  assert.deepEqual(at(base({ gates: { accepted: false } }), "gates"), ["needs_you", "accept_gates"]);
  assert.deepEqual(at(base({ gates: { accepted: true } }), "gates"), ["done", null]);
});

test("stage 3 Verdict: needs you, done, or stopped on NO_GO", () => {
  assert.deepEqual(at(base(), "verdict"), ["needs_you", "run_scenario"]);
  assert.deepEqual(at(base({ verdict: "GO_SUPERVISED" }), "verdict"), ["done", null]);
  assert.deepEqual(at(base({ verdict: "ASSISTANT_ONLY" }), "verdict"), ["done", null]);
  assert.deepEqual(at(base({ verdict: "NO_GO" }), "verdict"), ["stopped", "no_go"]);
});

test("stage 4 Pilot evals: no set, no run, bar not met, met", () => {
  assert.deepEqual(at(base({ evalSet: false }), "evals"), ["not_yet", "no_eval_set"]);
  assert.deepEqual(at(base(), "evals"), ["needs_you", "run_evals"]);
  assert.deepEqual(at(base({ evalRuns: 1, evalMet: false }), "evals"), ["needs_you", "evals_not_met"]);
  assert.deepEqual(at(base({ evalRuns: 2, evalMet: true }), "evals"), ["done", null]);
});

test("stage 5 Tuning: not yet before any run, needs you until certified, then done", () => {
  assert.deepEqual(at(base(), "tuning"), ["not_yet", "evals_first"]);
  assert.deepEqual(at(base({ evalRuns: 1, evalMet: false }), "tuning"), ["needs_you", "tune_certify"]);
  assert.deepEqual(at(base({ evalRuns: 1, evalMet: false, tuning: log([], "certification", { met: false }) }), "tuning"), ["needs_you", "tune_certify"]);
  assert.deepEqual(at(base({ evalRuns: 1, evalMet: true, tuning: certified() }), "tuning"), ["done", null]);
});

test("stage 6 Approval: not yet, ready to sign, signed, withheld", () => {
  assert.deepEqual(at(base(), "approval"), ["not_yet", "needs_certification"]);
  assert.deepEqual(at(base({ tuning: certified() }), "approval"), ["needs_you", "sign"]);
  assert.deepEqual(at(base({ tuning: approved() }), "approval"), ["done", null]);
  assert.deepEqual(at(base({ tuning: log(certified(), "approval", { decision: "WITHHOLD", signer: "p" }) }), "approval"), ["stopped", "withheld"]);
});

test("stage 7 Production: replayed from the watchdog log", () => {
  assert.deepEqual(at(base(), "production"), ["not_yet", "needs_approval"]);
  assert.deepEqual(at(base({ tuning: approved() }), "production"), ["needs_you", "deploy"]);
  assert.deepEqual(at(base({ tuning: approved(), watch: deployed() }), "production"), ["done", null]);
  const w = (k: "warning" | "suspension" | "reinstatement", p: Record<string, unknown> = {}) => log(deployed(), k, { penalty: 5, reason: "x", ...p });
  assert.deepEqual(at(base({ tuning: approved(), watch: w("warning") }), "production"), ["needs_you", "warned"]);
  assert.deepEqual(at(base({ tuning: approved(), watch: w("suspension") }), "production"), ["stopped", "suspended"]);
  const susp = w("suspension");
  assert.deepEqual(at(base({ tuning: approved(), watch: log(susp, "reinstatement", {}) }), "production"), ["needs_you", "probation"]);
});

test("real production windows: a window of the real runner gives done when clean and stopped when it suspends", () => {
  const cfg = baselineConfig("UC02-agent");
  const all = evalSetFor("UC02");
  let wl = deployed();
  const win = runWindow(cfg, all, noDesignation(), null);
  wl = [...wl, ...appendWindow(wl, win, "w", T)];
  assert.equal(at(base({ tuning: approved(), watch: wl }), "production")[0], win.clean ? "done" : "stopped");
});

test("counter, next stage, and a fresh use case waits on SOP intake first", () => {
  const fresh = journeyStatus(base({ sop: { attached: false, profiles: 0, ticked: 0, kbOk: false, skills: 0 } }));
  assert.equal(fresh.done, 0);
  assert.equal(fresh.next, "sop");
  const mid = journeyStatus(base({ gates: { accepted: true }, verdict: "GO_SUPERVISED" }));
  assert.deepEqual([mid.done, mid.next], [3, "tests"], "the new stage comes next: approve the tests and parameters before the pilot");
});

test("every translation key the journey and profile screens use has an Arabic string", () => {
  const keys = new Set<string>();
  for (const f of ["src/app/admin/federal/_components/JourneyBar.tsx", "src/app/admin/federal/use-cases/[id]/sop/page.tsx", "src/app/admin/federal/use-cases/[id]/sop/ProfileControls.tsx", "src/app/admin/federal/sop/SopWorkbench.tsx", "src/app/admin/federal/FederalPanel.tsx"]) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bk="((?:jb|pf)\.[\w.]+)"/g)) keys.add(m[1]);
    for (const m of src.matchAll(/(?:tr\(lang, |\bt\()"((?:jb|pf)\.[\w.]+)"/g)) keys.add(m[1]);
  }
  for (const r of Object.keys(REASON_EN)) keys.add(`jb.r.${r}`);
  for (const s of STAGE_IDS) { keys.add(`jb.stage.${s}`); keys.add(`jb.give.${s}`); }
  for (const s of ["done", "needs_you", "not_yet", "stopped"]) keys.add(`jb.state.${s}`);
  for (const g of GROUPS) keys.add(`jb.group.${g}`);
  for (const e of ["all_pass", "one_fix", "hosting_fails", "no_evidence"]) keys.add(`pf.ev.${e}`);
  assert.ok(keys.size > 50, `found ${keys.size}`);
  assert.deepEqual([...keys].filter((k) => !AR[k]), []);
});

test("stage 4 tests and parameters: after the SOP; done when every ticked profile has an approved, unchanged test set and approved parameters", () => {
  assert.deepEqual(at(base({ sop: { ...sop, attached: false, ticked: 0, skills: 0 } }), "tests"), ["not_yet", "after_sop"]);
  assert.deepEqual(at(base(), "tests"), ["needs_you", "approve_tests"]);
  assert.deepEqual(at(base({ tests: { ticked: 2, ready: 1 } }), "tests"), ["needs_you", "approve_tests"], "one of two is not enough");
  assert.deepEqual(at(base({ tests: { ticked: 2, ready: 2 } }), "tests"), ["done", null]);
});

test("stage 5 pilot and verdict: after the tests; needs a run; done only when every ticked profile's latest pilot is conclusive with nothing failing", () => {
  const ready = { tests: { ticked: 2, ready: 2 } };
  assert.deepEqual(at(base(), "pilot"), ["not_yet", "tests_first"]);
  assert.deepEqual(at(base({ ...ready }), "pilot"), ["needs_you", "run_pilot"]);
  assert.deepEqual(at(base({ ...ready, pilot: { ticked: 2, run: 2, met: 1 } }), "pilot"), ["needs_you", "pilot_not_met"], "inconclusive or failing");
  assert.deepEqual(at(base({ ...ready, pilot: { ticked: 2, run: 1, met: 1 } }), "pilot"), ["needs_you", "pilot_not_met"], "one profile has no pilot yet");
  assert.deepEqual(at(base({ ...ready, pilot: { ticked: 2, run: 2, met: 2 } }), "pilot"), ["done", null]);
});

test("the internal control: a stage cannot be done, need someone or stop the road until the stage before it is done", () => {
  // UC02 as it was: evals, tuning and approval records exist, but no job profile is ticked (SOP intake is open)
  const ahead = base({ sop: { ...sop, ticked: 0, skills: 0 }, evalRuns: 1, evalMet: true, tuning: approved() });
  assert.deepEqual(at(ahead, "approval"), ["done", null], "on its own records approval is done");
  assert.deepEqual(ordered(ahead, "sop"), ["needs_you", "tick_profile"]);
  for (const id of STAGE_IDS.filter((x) => x !== "sop")) assert.equal(ordered(ahead, id)[0], "not_yet", id);
  const j = journeyStatus(ahead);
  assert.equal(j.done, 0);
  assert.equal(j.waiting, 1, "only the first open stage waits for someone");
  assert.equal(j.next, "sop", "nothing starts without SOP intake");
  // a stage that is simply not yet keeps its own reason; a stage behind an open one reads after_previous
  assert.deepEqual(ordered(ahead, "approval"), ["not_yet", "after_previous"]);
  assert.deepEqual(ordered(ahead, "gates"), ["not_yet", "after_sop"]);
});

test("with every earlier stage done the order control changes nothing", () => {
  const full = base({ gates: { accepted: true }, verdict: "GO_SUPERVISED", tests: { ticked: 2, ready: 2 }, pilot: { ticked: 2, run: 2, met: 2 }, evalRuns: 1, evalMet: true, tuning: approved(), watch: deployed() });
  const j = journeyStatus(full);
  assert.equal(j.done, 9);
  assert.equal(j.next, null);
  for (const id of STAGE_IDS) assert.deepEqual(ordered(full, id), at(full, id), id);
});
