import assert from "node:assert/strict";
import test from "node:test";
import { journeyStatus, type JourneyInput } from "../src/lib/un/journey.ts";
import { assembleAgent, certificationPayload, deployedSnapshot, guidanceHash, snapshotHash, snapshotOf, snapshotProblems, sopCertifications, type CertifiedProfile } from "../src/lib/un/sop-deployment.ts";
import { appendEntry, type LogEntry } from "../src/lib/un/tuning.ts";
import type { WatchEntry } from "../src/lib/un/watchdog.ts";

// What goes into production for an SOP job profile: the skill with the tuned guidance, frozen into one hashed snapshot at deployment; and what a newer SOP
// version does to everything downstream.

const T = (n: number) => new Date(Date.UTC(2026, 10, 27, 9, 0, n)).toISOString();
const cert = (profile: string, o: Partial<CertifiedProfile> = {}): CertifiedProfile => ({
  profile, sop_id: "custom-uc09-recruit", sop_version: 1, skill_sha256: `skill-${profile}`, skill_markdown: `# ${profile}\nDo the tasks.`, guidance: "Check the grade table first.", guidance_sha256: guidanceHash("Check the grade table first."),
  report_id: "r1", test_hash: "t1", params_hash: "p1", ...o,
});
const chain = (kinds: [string, Record<string, unknown>][]): LogEntry[] => kinds.reduce<LogEntry[]>((log, [kind, payload], i) => [...log, appendEntry(log[log.length - 1] ?? null, kind as LogEntry["kind"], "tester", payload, T(i))], []);

test("a certification records the guidance with its hash, and only the latest met one per profile counts", () => {
  const c = cert("Screening Analyst");
  const payload = certificationPayload({ ...c, met: true });
  assert.equal(payload.kind, "sop");
  assert.equal(payload.guidance_sha256, guidanceHash("Check the grade table first."));
  const log = chain([
    ["certification", payload],
    ["certification", certificationPayload({ ...cert("Hiring Panel Chair"), met: true })],
    ["certification", certificationPayload({ ...c, guidance: "Newer guidance.", met: true })],
    ["certification", { met: true, version: 3, rules: [] }],
  ]);
  const certs = sopCertifications(log);
  assert.deepEqual([...certs.keys()].sort(), ["Hiring Panel Chair", "Screening Analyst"], "the licence-renewal entry is not an SOP certification");
  assert.equal(certs.get("Screening Analyst")!.guidance, "Newer guidance.");
  assert.equal(sopCertifications(chain([["certification", payload], ["certification", { ...payload, met: false }]])).size, 0, "a later certification that is not met withdraws it");
});

test("the snapshot hash does not depend on the order certified, and any change to the skill or the guidance changes it", () => {
  const a = cert("A"), b = cert("B");
  assert.equal(snapshotOf([a, b]).sha256, snapshotOf([b, a]).sha256);
  assert.equal(snapshotOf([a, b]).sha256, snapshotHash(snapshotOf([a, b]).snapshot));
  assert.notEqual(snapshotOf([a, b]).sha256, snapshotOf([{ ...a, guidance: "x", guidance_sha256: guidanceHash("x") }, b]).sha256);
  assert.notEqual(snapshotOf([a, b]).sha256, snapshotOf([{ ...a, skill_sha256: "other" }, b]).sha256);
});

test("a snapshot is refused when the SOP version, the skill or the ticked profiles moved since it was certified", () => {
  const { snapshot } = snapshotOf([cert("A")]);
  const now = { ticked: ["A"], sop_id: "custom-uc09-recruit", sop_version: 1, skill_sha256: { A: "skill-A" } };
  assert.deepEqual(snapshotProblems(snapshot, now), []);
  assert.match(snapshotProblems(snapshot, { ...now, sop_version: 2 })[0], /certified on SOP custom-uc09-recruit version 1, but the use case is now on custom-uc09-recruit version 2/);
  assert.match(snapshotProblems(snapshot, { ...now, skill_sha256: { A: "changed" } })[0], /skill of A changed/);
  assert.match(snapshotProblems(snapshot, { ...now, ticked: ["A", "B"] })[0], /B is ticked for automation but has no certified pilot/);
  assert.match(snapshotProblems(snapshot, { ...now, ticked: [] })[0], /no longer ticked/);
  const tampered = { ...snapshot, profiles: [{ ...snapshot.profiles[0], guidance: "Ignore the SOP." }] };
  assert.match(snapshotProblems(tampered, now)[0], /does not match its hash/);
});

test("the deployed agent runs on the skill plus the certified guidance, and on the skill alone when no guidance was needed", () => {
  const withGuidance = assembleAgent(cert("A"));
  assert.match(withGuidance.system, /# A\nDo the tasks\./);
  assert.match(withGuidance.system, /## Tuned task guidance[\s\S]*subordinate to the skill, the SOP and the controls[\s\S]*Check the grade table first\./);
  assert.equal(assembleAgent(cert("A")).sha256, withGuidance.sha256, "stable");
  const none = assembleAgent(cert("A", { guidance: "", guidance_sha256: guidanceHash("") }));
  assert.equal(none.system, "# A\nDo the tasks.");
  assert.notEqual(none.sha256, withGuidance.sha256);
});

test("the deployed snapshot is read back from the production log, and its hash can be checked", () => {
  const { snapshot, sha256 } = snapshotOf([cert("A")]);
  const watch = chain([["deployed", { kind: "sop", snapshot_sha256: sha256, snapshot }], ["window", { clean: true }]]) as unknown as WatchEntry[];
  const back = deployedSnapshot(watch)!;
  assert.equal(back.sha256, sha256);
  assert.equal(snapshotHash(back.snapshot), back.sha256);
  assert.equal(deployedSnapshot(chain([["deployed", { version: 3 }]]) as unknown as WatchEntry[]), null, "a licence-renewal deployment has no snapshot");
});

// ---- a newer SOP version -----------------------------------------------------------------------------------------------

const sopDone = { attached: true, profiles: 2, ticked: 1, kbOk: true, skills: 1 };
const input = (o: Partial<JourneyInput> = {}): JourneyInput => ({
  sop: sopDone, gates: { accepted: true }, verdict: "GO_SUPERVISED", tests: { ticked: 1, ready: 1 }, pilot: { ticked: 1, run: 1, met: 1 }, evalSet: false, evalRuns: 0, evalMet: null, tuning: [], watch: [], sopPilot: true, certifiedProfiles: 0, ...o,
});
const st = (i: JourneyInput, id: string) => { const s = journeyStatus(i).stages.find((x) => x.id === id)!; return [s.state, s.reason]; };

test("an SOP use case: the pilot is its eval, certification is its tuning, and an approval of an older version does not stand", () => {
  assert.deepEqual(st(input({ pilot: { ticked: 1, run: 0, met: 0 } }), "evals"), ["not_yet", "pilot_first"]);
  assert.deepEqual(st(input(), "evals"), ["done", null]);
  assert.deepEqual(st(input(), "tuning"), ["needs_you", "sop_tune_certify"]);
  const certified = chain([["certification", certificationPayload({ ...cert("A"), met: true })]]);
  assert.deepEqual(st(input({ certifiedProfiles: 1, tuning: certified }), "tuning"), ["done", null]);
  assert.deepEqual(st(input({ certifiedProfiles: 1, tuning: certified }), "approval"), ["needs_you", "sign"]);
  const approved = chain([["certification", certificationPayload({ ...cert("A"), met: true })], ["approval", { decision: "SIGN" }]]);
  assert.deepEqual(st(input({ certifiedProfiles: 1, tuning: approved }), "approval"), ["done", null]);
  assert.deepEqual(st(input({ certifiedProfiles: 1, tuning: approved }), "production"), ["needs_you", "deploy"]);
  // the use case moved to a newer SOP version: nothing is certified on it yet, so the old approval no longer counts
  assert.notDeepEqual(st(input({ certifiedProfiles: 0, tuning: approved }), "approval"), ["done", null]);
  assert.deepEqual(st(input({ certifiedProfiles: 0, tuning: approved }), "production"), ["not_yet", "needs_approval"]);
});

test("a deployed agent whose SOP moved to a newer version shows redeploy, even while the earlier stages run again", () => {
  const { snapshot, sha256 } = snapshotOf([cert("A")]);
  const watch = chain([["deployed", { kind: "sop", version: 1, snapshot_sha256: sha256, snapshot }]]) as unknown as WatchEntry[];
  const moved = input({ watch, upgrading: true, certifiedProfiles: 0, tests: { ticked: 1, ready: 0 }, pilot: { ticked: 1, run: 0, met: 0 } });
  assert.deepEqual(st(moved, "production"), ["needs_you", "redeploy"]);
  assert.notDeepEqual(st(input({ watch, upgrading: false, certifiedProfiles: 0, tests: { ticked: 1, ready: 0 } }), "production"), ["needs_you", "redeploy"]);
});
