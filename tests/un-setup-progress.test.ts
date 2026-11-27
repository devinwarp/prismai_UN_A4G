import assert from "node:assert/strict";
import test from "node:test";
import { setupProgress, waitingFor, type SetupFacts } from "../src/lib/un/setup-progress.ts";

const facts = (over: Partial<SetupFacts> = {}): SetupFacts => ({ countryReady: false, policyReady: true, governanceAppointed: false, goalsReady: false, cases: 0, targetsApproved: 0, targetsProposed: 0, attached: 0, sopReady: 0, ...over });
const states = (f: SetupFacts) => setupProgress(f).steps.map((s) => `${s.id}:${s.state}`).join(" ");

test("a fresh country starts at country setup and everything after it is locked", () => {
  assert.equal(states(facts()), "country:current goals:locked cases:locked targets:locked sop:locked");
  assert.equal(setupProgress(facts()).next, "country");
});

test("the country step needs the rules AND a governance admin", () => {
  assert.equal(setupProgress(facts({ countryReady: true })).next, "country");
  assert.equal(setupProgress(facts({ countryReady: true, governanceAppointed: true })).next, "goals");
});

test("the country step also needs the country's policy target configured", () => {
  const f = facts({ countryReady: true, governanceAppointed: true, policyReady: false });
  assert.equal(setupProgress(f).next, "country");
  assert.equal(setupProgress({ ...f, policyReady: true }).next, "goals");
});

test("steps open one at a time", () => {
  const country = { countryReady: true, governanceAppointed: true };
  assert.equal(states(facts({ ...country, goalsReady: true })), "country:done goals:done cases:current targets:locked sop:locked");
  assert.equal(states(facts({ ...country, goalsReady: true, cases: 3 })), "country:done goals:done cases:done targets:current sop:locked");
  assert.equal(states(facts({ ...country, goalsReady: true, cases: 3, targetsApproved: 3 })), "country:done goals:done cases:done targets:done sop:current");
  const all = setupProgress(facts({ ...country, goalsReady: true, cases: 3, targetsApproved: 3, attached: 3, sopReady: 3 }));
  assert.equal(all.done, 5);
  assert.equal(all.next, null);
});

test("targets are done only when EVERY use case has an approved set; a proposal is not enough", () => {
  const f = facts({ countryReady: true, governanceAppointed: true, goalsReady: true, cases: 3, targetsApproved: 2, targetsProposed: 1 });
  const p = setupProgress(f);
  assert.equal(p.next, "targets");
  assert.deepEqual(p.steps[3].count, { done: 2, of: 3 });
});

test("an SOP that is attached is not enough: the SOP step is done only when its stage is ready (knowledge base, a profile ticked, skills)", () => {
  const f = facts({ countryReady: true, governanceAppointed: true, goalsReady: true, cases: 2, targetsApproved: 2, attached: 2, sopReady: 1 });
  assert.equal(states(f), "country:done goals:done cases:done targets:done sop:current");
  assert.deepEqual(setupProgress(f).steps[4].count, { done: 1, of: 2 });
  assert.equal(setupProgress({ ...f, sopReady: 2 }).done, 5);
});

test("a later step is locked even when its own rule holds (an SOP attached before targets are approved)", () => {
  const f = facts({ countryReady: true, governanceAppointed: true, goalsReady: true, cases: 2, targetsApproved: 1, attached: 2, sopReady: 2 });
  assert.equal(states(f), "country:done goals:done cases:done targets:current sop:locked");
  assert.equal(waitingFor(setupProgress(f), "sop"), "targets");
  assert.equal(waitingFor(setupProgress(f), "targets"), null);
});

test("an earlier step that regresses locks the later ones again", () => {
  const ok = facts({ countryReady: true, governanceAppointed: true, goalsReady: true, cases: 1, targetsApproved: 1, attached: 1, sopReady: 1 });
  assert.equal(setupProgress(ok).done, 5);
  assert.equal(states({ ...ok, goalsReady: false }), "country:done goals:current cases:locked targets:locked sop:locked");
});
