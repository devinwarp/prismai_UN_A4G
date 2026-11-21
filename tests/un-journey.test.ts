import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AR } from "../src/lib/un/i18n/dict.ts";
import { GROUPS, REASON_EN, STAGE_IDS, journeyStatus, type JourneyInput, type StageId } from "../src/lib/un/journey.ts";
import { appendEntry, type LogEntry } from "../src/lib/un/tuning.ts";
import { appendWindow, runWindow, type WatchEntry } from "../src/lib/un/watchdog.ts";
import { baselineConfig } from "../src/lib/un/subject.ts";
import { evalSetFor, noDesignation } from "../src/lib/un/evalset.ts";

const sop = { attached: true, profiles: 4, ticked: 2, kbOk: true, skills: 2 };
const base = (o: Partial<JourneyInput> = {}): JourneyInput => ({ sop, gates: null, verdict: null, evalSet: true, evalRuns: 0, evalMet: null, tuning: [], watch: [], ...o });
const at = (i: JourneyInput, id: StageId) => { const s = journeyStatus(i).stages.find((x) => x.id === id)!; return [s.state, s.reason]; };
let n = 0;
const T = () => new Date(Date.UTC(2026, 10, 21, 9, 0, n++)).toISOString();
const log = <K extends string>(prev: { seq: number; hash: string; kind: K }[], kind: K, payload: Record<string, unknown>) =>
  [...prev, appendEntry(prev[prev.length - 1] as never, kind, "p", payload, T())] as never;
const certified = (): LogEntry[] => log([], "certification", { met: true, version: 2 });
const approved = (): LogEntry[] => log(certified(), "approval", { decision: "SIGN", version: 2, signer: "p" });
const deployed = (): WatchEntry[] => log([], "deployed", { version: 2 });

test("seven stages in five groups, in order", () => {
  const j = journeyStatus(base());
  assert.deepEqual(j.stages.map((s) => s.id), [...STAGE_IDS]);
  assert.deepEqual(GROUPS.map((g) => j.stages.filter((s) => s.group === g).map((s) => s.n)), [[1, 2], [3], [4, 5], [6], [7]]);
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
  assert.deepEqual([mid.done, mid.next], [3, "evals"]);
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
