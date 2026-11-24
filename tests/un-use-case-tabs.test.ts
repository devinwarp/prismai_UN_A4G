import assert from "node:assert/strict";
import test from "node:test";
import { TABS, tabFor } from "../src/lib/un/use-case-tabs.ts";

test("every route segment of a use case belongs to one tab", () => {
  const cases: [string | null, string][] = [
    [null, "overview"], ["sop", "setup"], ["targets", "setup"], ["tests", "setup"],
    ["pilot", "pilot"], ["evals", "pilot"], ["tuning", "tuning"], ["improve", "tuning"], ["production", "production"],
  ];
  for (const [seg, tab] of cases) assert.equal(tabFor(seg), tab, String(seg));
});

test("a stage link (?stage=) stays on the tab of its page: only the segment decides", () => {
  assert.equal(tabFor("sop"), "setup");
  assert.equal(tabFor("tuning"), "tuning");
});

test("an unknown segment falls back to overview", () => {
  assert.equal(tabFor("unknown"), "overview");
});

test("the tab list is the five tabs with hrefs relative to the use case", () => {
  assert.deepEqual(TABS.map((t) => [t.id, t.href]), [["overview", ""], ["setup", "/sop"], ["pilot", "/pilot"], ["tuning", "/tuning"], ["production", "/production"]]);
});
