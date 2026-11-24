import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseUseCasePatch } from "../src/lib/un/guard.ts";
import { journeyStatus, type JourneyInput } from "../src/lib/un/journey.ts";

const src = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("the stage cannot be set to approved or deployed by hand; the other stages still can", () => {
  for (const stage of ["approved", "deployed"]) {
    const r = parseUseCasePatch({ stage });
    assert.equal(r.ok, false, stage);
    assert.match(r.ok ? "" : r.error, /cannot be set by hand/);
    assert.match(r.ok ? "" : r.error, /checks the pilot report/);
  }
  for (const stage of ["intake", "sop", "org", "scout", "pilot"]) assert.deepEqual(parseUseCasePatch({ stage }), { ok: true, patch: { stage } });
  assert.equal(parseUseCasePatch({ stage: "nope" }).ok, false);
});

test("the dashboard does not offer approved or deployed in a row's stage menu", () => {
  const panel = src("src/app/admin/federal/FederalPanel.tsx");
  assert.match(panel, /STAGES\.filter\(\(s\) => \(s !== "approved" && s !== "deployed"\) \|\| s === u\.stage\)/);
});

const ready: JourneyInput = {
  sop: { attached: true, profiles: 4, ticked: 1, kbOk: true, skills: 1 }, gates: { accepted: true }, verdict: "GO_SUPERVISED", tests: { ticked: 1, ready: 1 }, pilot: { ticked: 1, run: 1, met: 1 },
  evalSet: true, evalRuns: 1, evalMet: true,
  tuning: [
    { seq: 1, kind: "baseline", at: "t", actor: "a", payload: {}, prev_hash: "0", hash: "h1" },
    { seq: 2, kind: "certification", at: "t", actor: "a", payload: { met: true, version: 1 }, prev_hash: "h1", hash: "h2" },
  ] as never,
  watch: [],
};
const at = (j: JourneyInput, id: string) => { const s = journeyStatus(j).stages.find((x) => x.id === id)!; return [s.state, s.reason]; };

test("a certified agent whose pilot is not met is something to fix, not something to sign; once met it is signable", () => {
  assert.deepEqual(at({ ...ready, release: { ready: false, blockers: 3 } }, "approval"), ["needs_you", "release_blocked"]);
  assert.deepEqual(at({ ...ready, release: { ready: true, blockers: 0 } }, "approval"), ["needs_you", "sign"]);
  assert.deepEqual(at(ready, "approval"), ["needs_you", "sign"], "not worked out (a list of many): not gated here");
});

test("signing the approval, and going into production, both read the release gate before they write anything", () => {
  const approve = src("src/app/api/admin/un/use-cases/[id]/tuning/approve/route.ts");
  assert.match(approve, /release = await loadRelease\(/);
  assert.ok(approve.indexOf("loadRelease(") < approve.indexOf("appendEntry("), "the gate before the entry");
  assert.match(approve, /Approval needs a met pilot/);
  assert.match(approve, /release: \{ reports: release\.reports, targets_hash:/, "the signature records which reports it covers");
  assert.ok(approve.indexOf("loadRelease(") < approve.indexOf('update({ stage: "approved"'), "the gate before the stage");
  const watch = src("src/app/api/admin/un/use-cases/[id]/watchdog/route.ts");
  const deploy = watch.slice(watch.indexOf('b.action === "deploy"'));
  assert.match(deploy, /loadRelease\(/);
  assert.ok(deploy.indexOf("loadRelease(") < deploy.indexOf('appendEntry<WatchEntry["kind"]>(null, "deployed"'), "the gate before the deployment");
  assert.match(deploy, /Going into production needs a met pilot/);
});

test("the release route is read-only and open to any signed-in role, like the other readers", () => {
  const r = src("src/app/api/admin/un/use-cases/[id]/release/route.ts");
  assert.match(r, /requirePermission\("view"\)/);
  assert.doesNotMatch(r, /export async function (POST|PATCH|PUT|DELETE)/);
});

test("a signed verdict assesses, it does not deploy: only the approval sets approved and only the go-live sets deployed, and a verdict never moves a stage backwards", () => {
  const watch = src("src/app/api/admin/un/use-cases/[id]/watchdog/route.ts");
  const deploy = watch.slice(watch.indexOf('b.action === "deploy"'));
  assert.ok(deploy.indexOf("loadRelease(") < deploy.indexOf('stage: "deployed"'), "the stage after the gate");
  assert.ok(deploy.indexOf("appendWatch(") < deploy.indexOf('stage: "deployed"'), "the stage after the deployment is recorded");
  const approve = src("src/app/api/admin/un/use-cases/[id]/tuning/approve/route.ts");
  assert.match(approve, /stage: "approved"/);
  const runs = src("src/lib/un/runs.ts");
  assert.match(runs, /if \(uc\.stage === "approved" \|\| uc\.stage === "deployed"\) delete patch\.stage;/);
  const guard = src("src/lib/un/guard.ts");
  assert.doesNotMatch(guard, /GO_AUTONOMOUS" \|\| verdict === "GO_SUPERVISED" \? "deployed"/);
});
