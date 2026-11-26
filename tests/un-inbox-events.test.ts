import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HUMAN_DECISIONS } from "../src/lib/un/raci.ts";

const R = "src/app/api/admin/un/use-cases/[id]/";
const read = (p: string) => readFileSync(R + p, "utf8");

test("the tuning proposals and a reinstatement are decisions only a person takes", () => {
  for (const k of ["tuning.decide", "reinstate", "goals.approve", "version.approve"]) assert.ok((HUMAN_DECISIONS as readonly string[]).includes(k), k);
});

test("each event route tells the inbox, and asks for a decision only where one is needed", () => {
  assert.match(read("pilot/route.ts"), /noticeInform\([^\n]*"pilot\.filed"/);
  assert.match(read("pilot/goals/route.ts"), /noticeAsk\([^\n]*decisionKind: "goals\.approve"/);
  assert.match(read("pilot/goals/route.ts"), /noticeDone\(/);
  assert.match(read("rerun/route.ts"), /noticeAsk\([^\n]*"rerun\.requested"/);
  assert.match(read("rerun/route.ts"), /noticeDone\([^\n]*"rerun\.done"/);
  assert.match(read("tuning/route.ts"), /decisionKind: "version\.approve"/);
  assert.match(read("tuning/approve/route.ts"), /noticeDone\(/);
  assert.match(read("autotune/route.ts"), /decisionKind: "tuning\.decide"/);
  assert.match(read("watchdog/route.ts"), /decisionKind: after === "suspended" \? "reinstate"/);
  assert.match(read("watchdog/route.ts"), /"monitor\.reinstated"/);
});

test("the notice helpers never throw: the action stands even when the inbox is missing", () => {
  const src = readFileSync("src/lib/un/inbox-service.ts", "utf8");
  for (const fn of ["noticeAsk", "noticeDone", "noticeInform"]) {
    const body = src.slice(src.indexOf(`export async function ${fn}`));
    assert.match(body.slice(0, body.indexOf("\n}\n")), /try \{[\s\S]*catch/, fn);
  }
});
