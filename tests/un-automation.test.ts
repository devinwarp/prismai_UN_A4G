import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { automationOf } from "../src/lib/un/automation.ts";

test("who is doing the work: people until a profile is ticked, an agent in progress after, an agent done once deployed", () => {
  assert.equal(automationOf({ ticked: 0, deployed: false }), "human");
  assert.equal(automationOf({ ticked: 1, deployed: false }), "agent_progress");
  assert.equal(automationOf({ ticked: 3, deployed: false }), "agent_progress");
  assert.equal(automationOf({ ticked: 2, deployed: true }), "agent_done");
  // a deployed use case reads as done even if its profile ticks were later cleared
  assert.equal(automationOf({ ticked: 0, deployed: true }), "agent_done");
});

test("the register shows a Work by column with the icon and word, and the Arabic words exist", () => {
  const panel = readFileSync("src/app/admin/federal/FederalPanel.tsx", "utf8");
  assert.match(panel, /wk\.col/);
  assert.match(panel, /<WorkIcon kind=\{work\[u\.id\] \?\? "human"\}/);
  const ar = readFileSync("src/lib/un/i18n/ui-a-ar.ts", "utf8");
  for (const k of ["wk.col", "wk.human", "wk.progress", "wk.done"]) assert.match(ar, new RegExp(`"${k.replace(".", "\\.")}"`), k);
});
