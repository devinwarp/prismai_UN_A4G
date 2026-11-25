import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buttonFor, needsRequest, parseReason, planRequest, planRerun, staleSince, MAX_REASON, MIN_REASON, type RerunRequest } from "../src/lib/un/rerun.ts";
import { AR } from "../src/lib/un/i18n/dict.ts";

const open: RerunRequest = { id: "r1", use_case_id: "u1", requested_by: "p", requested_email: "owner@x.test", reason: "The licensing rules changed in March", requested_at: "2026-11-01T00:00:00.000Z", status: "open", resolved_by: null, resolved_at: null, run_id: null };
const none = { hasRun: true, open: null };

test("only a deployed use case needs a request; every other stage can be rerun directly", () => {
  assert.equal(needsRequest("deployed"), true);
  for (const s of ["intake", "sop", "org", "scout", "pilot", "approved"]) assert.equal(needsRequest(s), false, s);
});

test("the rerun icon: nothing to repeat, ready, needs a request, or requested", () => {
  assert.equal(buttonFor("pilot", { hasRun: false, open: null }), "no_run");
  assert.equal(buttonFor("deployed", { hasRun: false, open: null }), "no_run");
  assert.equal(buttonFor("pilot", none), "ready");
  assert.equal(buttonFor("approved", { hasRun: true, open }), "ready", "a request means nothing before deployment");
  assert.equal(buttonFor("deployed", none), "needs_request");
  assert.equal(buttonFor("deployed", { hasRun: true, open }), "requested");
});

test("a deployed use case is rerun only while a request is open; other use cases need none; nothing without an earlier run", () => {
  assert.ok(planRerun("pilot", none).ok);
  assert.ok(planRerun("deployed", { hasRun: true, open }).ok);
  const wait = planRerun("deployed", none);
  assert.ok(!wait.ok && wait.status === 409 && /process owner/.test(wait.error));
  const nothing = planRerun("pilot", { hasRun: false, open: null });
  assert.ok(!nothing.ok && /no earlier run/.test(nothing.error));
  assert.ok(!planRerun("deployed", { hasRun: false, open }).ok);
});

test("a request: only for a deployed use case with an earlier run and no request already open; the reason is real text", () => {
  assert.ok(planRequest("deployed", none).ok);
  const early = planRequest("pilot", none);
  assert.ok(!early.ok && /directly/.test(early.error));
  assert.ok(!planRequest("deployed", { hasRun: false, open: null }).ok);
  const dup = planRequest("deployed", { hasRun: true, open });
  assert.ok(!dup.ok && dup.status === 409);
  assert.deepEqual(parseReason("  The rules   changed in March  "), { ok: true, reason: "The rules changed in March" });
  assert.equal(parseReason("too short").ok, false);
  assert.equal(parseReason("x".repeat(MIN_REASON - 1)).ok, false);
  assert.equal(parseReason("x".repeat(MAX_REASON + 1)).ok, false);
  assert.equal(parseReason(null).ok, false);
});

test("a use case is out of date when its country's rule set or documents, or its own SOP or profiles, changed after its last run", () => {
  const at = (n: number) => `2026-11-${String(n).padStart(2, "0")}T00:00:00.000Z`;
  const log = [
    { kind: "country_updated", at: at(10), payload: { id: "UAE", patch: { ruleset: "eu-ai-act" } } },
    { kind: "country_updated", at: at(11), payload: { id: "UAE", patch: { name: "Renamed" } } },
    { kind: "country_updated", at: at(12), payload: { id: "SG", patch: { ruleset: "uae-federal" } } },
    { kind: "policy_added", at: at(13), payload: { policy: { country: "NL" } } },
    { kind: "sop_changed", at: at(14), payload: { use_case: "UC02" } },
    { kind: "profile_changed", at: at(15), payload: { use_case: "UC05" } },
  ];
  const o = { country: "UAE", ext: "UC02" };
  assert.equal(staleSince(log, { ...o, lastRunAt: null }), null, "never run: nothing is out of date");
  assert.deepEqual(staleSince(log, { ...o, lastRunAt: at(1) }), { since: at(14), why: "sop" }, "the latest relevant change; a rename and other countries do not count");
  assert.equal(staleSince(log, { ...o, lastRunAt: at(16) }), null, "run after every change: up to date");
  assert.deepEqual(staleSince(log, { country: "UAE", ext: "UC09", lastRunAt: at(1) }), { since: at(10), why: "country_rules" });
  assert.deepEqual(staleSince(log, { country: "NL", ext: "UC09", lastRunAt: at(1) }), { since: at(13), why: "country_policy" });
  assert.deepEqual(staleSince(log, { country: "UAE", ext: "UC05", lastRunAt: at(1) }), { since: at(15), why: "profile" });
});

test("the rerun route needs the two permissions, uses the plans, logs both actions, and no country action reruns a use case by itself", () => {
  const route = readFileSync("src/app/api/admin/un/use-cases/[id]/rerun/route.ts", "utf8");
  assert.match(route, /requirePermission\(\["rerun\.request", "rerun\.run"\]/);
  assert.match(route, /decide\("rerun\.request"\)/);
  assert.match(route, /decide\("rerun\.run"\)/);
  assert.match(route, /planRequest/);
  assert.match(route, /planRerun/);
  assert.match(route, /resolveRequest/);
  assert.match(route, /rerun_requested/);
  assert.match(route, /rerun_done/);
  // updating a country's rule set re-runs nothing: the use cases are marked out of date instead
  const act = readFileSync("src/lib/un/country-actions.ts", "utf8");
  const upd = act.slice(act.indexOf("export async function updateCountry"), act.indexOf("const isDate"));
  assert.doesNotMatch(upd, /runFor\(/);
  assert.match(upd, /Nothing is re-run here/);
  const panel = readFileSync("src/app/admin/federal/FederalPanel.tsx", "utf8");
  assert.match(panel, /RerunControl/);
  const ui = readFileSync("src/app/admin/federal/_components/RerunButton.tsx", "utf8");
  const keys = [...new Set([...ui.matchAll(/"(rr\.[\w.]+)"/g)].map((m) => m[1]))];
  assert.ok(keys.length > 10);
  for (const k of keys) assert.ok(AR[k], `no Arabic for ${k}`);
  assert.ok(AR["rr.col"]);
});
