import assert from "node:assert/strict";
import test from "node:test";
import { checkStructured, NOT_STATED, parseStructured, uncoveredRefusal } from "../src/lib/un/sop-structure.ts";

// The cases the check wrongly reported on a fictitious Qanat SOP: everything here is in the draft, in a field the published SOP prints.
const SOURCE = [
  "| Owner | Head of Enforcement, Qanat Transport and Mobility Agency |",
  "- **Works with:** the Contact Officer, the camera and ticketing records.",
  "- **Skills:** clear writing in English and Arabic, the published transport rules, case-system entry.",
  "| Citizen reports a cloned plate | Case Reviewer | Enforcement Supervisor, the same day |",
  "Task ids are used in the audit log.",
].join("\n");
const parsed = parseStructured({
  title: "Fines", owner: "Head of Enforcement, Qanat Transport and Mobility Agency",
  roles: [{ name: "Enforcement Case Reviewer", works_with: ["Mobility Contact Officer", "camera and ticketing records"], skills: "Clear writing in English and Arabic, the published transport rules, case-system entry." }],
  tasks: [{ id: "T01", title: "Check the ticket", role: "Enforcement Case Reviewer", steps: ["Retrieve the ticket."] }],
  exceptions: [{ scenario: "Citizen reports a cloned plate", handled_by: "Enforcement Case Reviewer", escalate_to: "Enforcement Supervisor", what_to_do: "Escalate the same day." }],
});
if (!parsed.ok) throw new Error(parsed.error);

test("coverage counts every field the published SOP prints, so only the statement the draft really dropped is reported", () => {
  assert.deepEqual(checkStructured(parsed.model, SOURCE).coverage.uncovered, ["Task ids are used in the audit log."]);
});

test("the uncovered list is complete, not cut at fifteen", () => {
  const many = Array.from({ length: 22 }, (_, i) => `Item ${i} requires zebra${i} giraffe${i} walrus${i} before closure.`).join("\n");
  assert.equal(checkStructured(parsed.model, many).coverage.uncovered.length, 22);
});

test("approving a draft that leaves statements out needs a reason; a draft that carries everything does not", () => {
  const left = checkStructured(parsed.model, SOURCE);
  assert.match(uncoveredRefusal(left, "") ?? "", /1 statement/);
  assert.ok(uncoveredRefusal(left, "ok"));
  assert.equal(uncoveredRefusal(left, "It describes the log format, not a step."), null);
  assert.equal(uncoveredRefusal({ ...left, coverage: { covered: 1, total: 1, uncovered: [] } }, ""), null);
  assert.equal(NOT_STATED.length > 0, true);
});
