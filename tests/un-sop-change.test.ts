import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_TEXT, MIN_PLAN, MIN_REASON, needsChangeRequest, parseChange, planChangeRequest, planResolve } from "../src/lib/un/sop/change.ts";

test("only a deployed use case needs a change request; every other stage follows new versions by itself", () => {
  assert.equal(needsChangeRequest("deployed"), true);
  for (const s of ["intake", "sop", "org", "scout", "pilot", "approved"]) assert.equal(needsChangeRequest(s), false, s);
});

test("a change request needs a reason and a plan, both real text", () => {
  const ok = parseChange("The fee schedule changed in March", "Check the fee steps in staging, then move; roll back by returning to version 1.");
  assert.ok(ok.ok);
  assert.ok(!parseChange("short", "A perfectly good plan for the change here").ok, "reason too short");
  assert.ok(!parseChange("A perfectly good reason for it", "too short").ok, "plan too short");
  assert.ok(!parseChange(null, null).ok);
  assert.ok(!parseChange("r".repeat(MAX_TEXT + 1), "p".repeat(MIN_PLAN)).ok, "reason too long");
  assert.ok(!parseChange("r".repeat(MIN_REASON), "p".repeat(MAX_TEXT + 1)).ok, "plan too long");
  const t = parseChange("  The   rules  changed ", "  First check   the fee steps, then move. ");
  assert.ok(t.ok && t.reason === "The rules changed" && t.plan === "First check the fee steps, then move.");
});

test("a request is made only for a deployed use case that is behind the latest version and has none open", () => {
  assert.ok(planChangeRequest({ stage: "deployed", attached: 1, latest: 2, open: false }).ok);
  const early = planChangeRequest({ stage: "pilot", attached: 1, latest: 2, open: false });
  assert.ok(!early.ok && /by itself/.test(early.error));
  const same = planChangeRequest({ stage: "deployed", attached: 2, latest: 2, open: false });
  assert.ok(!same.ok && /latest version/.test(same.error));
  const dup = planChangeRequest({ stage: "deployed", attached: 1, latest: 3, open: true });
  assert.ok(!dup.ok && dup.status === 409);
});

test("an open request can be applied or declined once", () => {
  assert.ok(planResolve({ status: "open" }).ok);
  assert.ok(!planResolve(null).ok);
  assert.ok(!planResolve({ status: "applied" }).ok);
  assert.ok(!planResolve({ status: "declined" }).ok);
});

test("a new version leaves a deployed use case on its version and moves the rest; a deployed one moves only through the change route", () => {
  const roll = readFileSync("src/lib/un/sop-rollout.ts", "utf8");
  assert.match(roll, /uc\.stage === "deployed"\) \{ frozen\.push/, "deployed: frozen, nothing changes");
  assert.match(roll, /attachSop\(orgId, uc\.id, v\.sop_id, actor, v\.version\)/, "not deployed: attached to the new version");
  assert.match(roll, /syncTicks/, "the Automate ticks follow the profiles");
  assert.match(roll, /rerunAffected/, "and the use case is rerun");
  const change = readFileSync("src/app/api/admin/un/use-cases/[id]/sop-change/route.ts", "utf8");
  assert.match(change, /requirePermission\(\["sop\.change\.request", "sop\.change\.apply"\]/);
  assert.match(change, /decide\("sop\.change\.request"\)/);
  assert.match(change, /decide\("sop\.change\.apply"\)/);
  for (const k of ["planChangeRequest", "parseChange", "planResolve", "sop_change_requested", "sop_change_applied", "sop_change_declined", "rerunAffected"]) assert.match(change, new RegExp(k), k);
  // the profiles route will not switch or re-point a deployed use case's SOP
  assert.match(readFileSync("src/app/api/admin/un/use-cases/[id]/profiles/route.ts", "utf8"), /if \(frozen\) return bad\(FROZEN\)/);
  const sql = readFileSync("supabase/un-entities-admin.sql", "utf8");
  assert.match(sql, /create table if not exists public\.un_sop_versions/);
  assert.match(sql, /add column if not exists version int/);
  assert.match(sql, /create table if not exists public\.un_sop_change_requests/);
  assert.doesNotMatch(sql, /un_custom_sops/);
});
