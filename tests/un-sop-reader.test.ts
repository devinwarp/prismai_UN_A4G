import assert from "node:assert/strict";
import { test } from "node:test";
import { DOCUMENT_START, findSopMatches, readerOutline, readerPages } from "../src/lib/un/sop/reader.ts";

test("the SOP reader keeps table rows and searches a repeated header only once", () => {
  const rows = Array.from({ length: 6 }, (_, i) => `| T0${i + 1} | Run step ${i + 1} |`);
  const pages = readerPages(["## Procedure", "", "| Task | Action |", "|---|---|", ...rows].join("\r\n"));
  const tables = pages.flat().filter((block) => block.kind === "table");
  assert.equal(tables.length, 2);
  assert.deepEqual(tables.map((table) => table.repeatedHeader), [false, true]);
  assert.deepEqual(findSopMatches(pages, "Task").map((match) => match.text), ["Task"]);
  assert.deepEqual(findSopMatches(pages, "t06").map((match) => match.text), ["T06"]);
});

test("the SOP reader finds literal phrases across formatting and on later pages", () => {
  const intro = Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1} about intake.\n`).join("\n");
  const pages = readerPages(`# Procedure\n\n${intro}\n## Final check\n\nConfirm **Task T16** [ready].\n`);
  assert.ok(pages.length > 1);
  const [match] = findSopMatches(pages, "confirm task t16 [ready]");
  assert.ok(match.page > 0);
  assert.equal(match.text.slice(match.start, match.end), "Confirm Task T16 [ready]");
  assert.deepEqual(findSopMatches(pages, ".*"), []);
});

test("an ordered list retains its start number and fences retain literal text", () => {
  const page = readerPages("4. Verify\n5. Publish\n\n```\n**literal**\n```").flat();
  assert.equal(page[0].kind, "list");
  assert.equal(page[0].kind === "list" && page[0].start, 4);
  assert.equal(page[1].kind, "code");
  assert.equal(findSopMatches([page], "**literal**").length, 1);
});

test("the outline tracks both a section continued from an earlier page and a new section on that page", () => {
  const [intro, first, continued, second, end] = readerPages(
    "# SOP\n\n## Intake\n\nCheck the case.\n\n## Approval\n\nRecord the decision.",
  ).flat();
  const outline = readerOutline([[intro, first], [continued, second], [end]]);
  assert.deepEqual(outline.sectionsByPage, [[DOCUMENT_START, first.id], [first.id, second.id], [second.id]]);
  assert.equal(outline.sectionByBlock.get(continued.id), first.id);
  assert.deepEqual(outline.headings.map(({ page, label }) => [page, label]), [[0, "Intake"], [1, "Approval"]]);
});
