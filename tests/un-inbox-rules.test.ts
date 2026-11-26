import assert from "node:assert/strict";
import test from "node:test";
import { addWorkingDays, countsOf, blockToHuman, dueForEscalation, escalateAtFor, failAttempt, handlerFor, MAX_ATTEMPTS, newItem } from "../src/lib/un/inbox.ts";
import { countriesNeedingGovernanceAdmin, missingPositions } from "../src/lib/un/people-agent.ts";
import { holdersOf } from "../src/lib/un/inbox-routing.ts";
import { DEFAULT_RACI, HUMAN_DECISIONS, isHumanDecision, modeOf, POSITIONS, route, STEPS, validateRaci, type Holder, type Step } from "../src/lib/un/raci.ts";

const NOW = new Date("2026-11-26T08:00:00Z"); // a Thursday
const holders: Holder[] = [
  { user_id: "owner", positions: ["owner"] },
  { user_id: "op", positions: ["operator"] },
  { user_id: "admin", positions: ["entity_admin"] },
  { user_id: "gov", positions: ["governance_admin"] },
  { user_id: "super", positions: ["platform"] },
];
const letterOf = (rs: ReturnType<typeof route>, u: string) => rs.find((r) => r.user_id === u)?.letter;

test("the default RACI is valid: every step has someone Responsible and exactly one Accountable", () => {
  const m = Object.fromEntries(STEPS.map((s) => [s, DEFAULT_RACI[s]])) as Record<Step, Record<string, never>>;
  assert.deepEqual(validateRaci(m as never), []);
  assert.deepEqual(validateRaci({ ...m, targets: { owner: "R", gov: "A", other: "A" } } as never).length, 1, "two Accountable is refused");
  assert.match(validateRaci({ ...m, deploy: { owner: "I" } } as never).join(" "), /nobody is Responsible/);
});

test("targets: the owner proposes (R), the governance admin approves (A), the super admin is told (I)", () => {
  const rs = route("targets", holders);
  assert.equal(letterOf(rs, "owner"), "R");
  assert.equal(letterOf(rs, "gov"), "A");
  assert.equal(letterOf(rs, "super"), "I");
  assert.equal(modeOf("A"), "approval");
  assert.equal(modeOf("R"), "action");
});

test("a missing user: the entity admin acts (AR), the super admin is informed; with no entity admin the super admin acts", () => {
  const withAdmin = route("people", holders);
  assert.equal(letterOf(withAdmin, "admin"), "AR");
  assert.equal(letterOf(withAdmin, "super"), "I");
  const noAdmin = route("people", holders.filter((h) => h.user_id !== "admin"));
  assert.equal(letterOf(noAdmin, "super"), "AR", "escalated to the super admin as an action");
  assert.equal(noAdmin.find((r) => r.user_id === "super")?.escalated_from, "entity_admin");
});

test("an override replaces the default for one person", () => {
  assert.equal(letterOf(route("targets", holders, [{ user_id: "op", letter: "A" }]), "op"), "A");
});

test("explicit decisions are human-only, and so are sign-offs and information; Responsible work starts with the agent", () => {
  for (const d of HUMAN_DECISIONS) { assert.equal(isHumanDecision(d), true, d); assert.equal(handlerFor(d, "R"), "human", `${d} is never an agent's, even if Responsible`); }
  assert.equal(handlerFor("people.position_missing", "AR"), "agent");
  assert.equal(handlerFor("people.position_missing", "I"), "human", "information is tagged for the person");
  assert.equal(handlerFor("targets.review", "A"), "human", "a sign-off is a person's");
  assert.equal(handlerFor("targets.consult", "C"), "agent", "a consult is drafted by the agent");
});

test("working days skip the weekend, and information never escalates", () => {
  assert.equal(addWorkingDays(NOW, 2).toISOString().slice(0, 10), "2026-11-30", "Thursday + 2 working days = Monday");
  assert.equal(escalateAtFor("action", NOW)?.slice(0, 10), "2026-11-30");
  assert.equal(escalateAtFor("inform", NOW), null);
});

test("an item starts with its handler, an agent that is blocked hands it to a person with the reason, and three failed attempts do the same", () => {
  const base = { kind: "people.position_missing", user_id: "admin", subject: "s", body: "b", letter: "AR" as const, dedupe_key: "k" };
  const item = newItem(base, { org_id: "o", id: "i1", now: NOW });
  assert.equal(item.handler, "agent");
  assert.equal(item.escalate_at, null, "an agent's item has no human clock yet");
  const blocked = blockToHuman(item, "user.create needs an entity admin of this entity", NOW);
  assert.equal(blocked.handler, "human");
  assert.equal(blocked.status, "blocked_human");
  assert.match(blocked.blocked_reason ?? "", /user\.create/);
  assert.ok(blocked.escalate_at);
  let t = item;
  for (let i = 0; i < MAX_ATTEMPTS; i++) t = failAttempt(t, "model unavailable", NOW);
  assert.equal(t.handler, "human");
  assert.match(t.blocked_reason ?? "", new RegExp(`after ${MAX_ATTEMPTS} attempts`));
});

test("only human items that are open and past their time are due for escalation, once", () => {
  const mk = (over: object) => ({ ...newItem({ kind: "k", user_id: "u", subject: "s", body: "b", letter: "AR", dedupe_key: "d" }, { org_id: "o", id: "i", now: new Date("2026-11-20T08:00:00Z") }), handler: "human" as const, escalate_at: "2026-11-24T08:00:00Z", ...over });
  assert.equal(dueForEscalation([mk({})], NOW).length, 1);
  assert.equal(dueForEscalation([mk({ status: "done" })], NOW).length, 0);
  assert.equal(dueForEscalation([mk({ escalated_at: "2026-11-25T00:00:00Z" })], NOW).length, 0, "already escalated");
  assert.equal(dueForEscalation([mk({ escalate_at: null })], NOW).length, 0, "information has no clock");
  assert.equal(dueForEscalation([mk({ escalate_at: "2026-12-30T08:00:00Z" })], NOW).length, 0, "not yet");
});

test("the People agent finds the positions nobody holds, by role and by job title", () => {
  const useCases = [{ id: "u1", ext_id: "UC01", entity: "Marsa", title: "t" }, { id: "u2", ext_id: "UC02", entity: "Marsa", title: "t" }];
  const assignments = [
    { user_id: "a", role: "process_owner", use_case_id: "u1" }, { user_id: "b", role: "operator", use_case_id: "u1" },
    { user_id: "c", role: "process_owner", use_case_id: "u2" }, { user_id: "e", role: "operator", use_case_id: null, scope_entity: "Marsa" },
  ];
  assert.deepEqual(missingPositions({ useCases, assignments, people: [] }), [], "an entity-wide operator covers every use case of the entity");
  const none = missingPositions({ useCases, assignments: assignments.filter((a) => a.user_id !== "e"), people: [] });
  assert.deepEqual(none.map((n) => `${n.ext_id} ${n.kind}`), ["UC02 operator"]);
  const profiles = missingPositions({ useCases, assignments, people: [{ id: "p", job_title: "document verification analyst" }], profileTitles: { u2: ["Document Verification Analyst", "Fee and Payment Officer"] } });
  assert.deepEqual(profiles.map((n) => n.title), ["Fee and Payment Officer"], "matched on the job title, case-insensitively");
  assert.ok(profiles[0].key.startsWith("job_profile:u2:"));
});

test("a country with entities must have a governance admin: one for the country or for the whole organisation", () => {
  assert.deepEqual(countriesNeedingGovernanceAdmin({ countriesWithEntities: ["UAE", "SG"], assignments: [{ user_id: "g", role: "governance_admin", use_case_id: null, scope_country: "UAE" }] }), ["SG"]);
  assert.deepEqual(countriesNeedingGovernanceAdmin({ countriesWithEntities: ["UAE", "SG"], assignments: [{ user_id: "g", role: "governance_admin", use_case_id: null }] }), []);
  assert.deepEqual(countriesNeedingGovernanceAdmin({ countriesWithEntities: ["UAE"], assignments: [{ user_id: "g", role: "governance_admin", use_case_id: null, scope_country: "UAE", revoked_at: "2026-11-01" }] }), ["UAE"]);
  for (const p of POSITIONS) assert.ok(p in DEFAULT_RACI.people);
});

test("who holds a position where something happened: by organisation, country, entity and use case scope, and the stored admin login", () => {
  const people = [{ id: "root", legacy_role: "admin" }, { id: "g", legacy_role: "employee" }, { id: "ea", legacy_role: "employee" }, { id: "op", legacy_role: "employee" }, { id: "po", legacy_role: "employee" }];
  const assignments = [
    { user_id: "g", role: "governance_admin", use_case_id: null, scope_country: "UAE" },
    { user_id: "ea", role: "entity_admin", use_case_id: null, scope_entity: "Marsa", scope_country: "UAE" },
    { user_id: "op", role: "operator", use_case_id: "u1" },
    { user_id: "po", role: "process_owner", use_case_id: "u2" },
  ];
  const at = (place: object) => Object.fromEntries(holdersOf(people, assignments, place).map((h) => [h.user_id, h.positions.sort().join("+")]));
  assert.deepEqual(at({ entity: "Marsa", country: "UAE", use_case_id: "u1" }), { root: "platform", g: "governance_admin", ea: "entity_admin", op: "operator" });
  assert.deepEqual(at({ entity: "Wahat", country: "UAE", use_case_id: "u2" }), { root: "platform", g: "governance_admin", po: "owner" }, "another entity: no Marsa admin");
  assert.deepEqual(at({ entity: "Marsa", country: "SG" }), { root: "platform" }, "another country: no UAE governance admin, no UAE-scoped entity admin");
});

test("the bell counts what needs a person: open human actions, approvals and consults, and unread information; agent items are counted apart", () => {
  const mk = (over: object) => ({ ...newItem({ kind: "k", user_id: "u", subject: "s", body: "b", letter: "AR", dedupe_key: "d" }, { org_id: "o", id: "i", now: NOW }), ...over });
  const items = [
    mk({ handler: "human", mode: "action" }), mk({ handler: "human", mode: "approval", letter: "A" }), mk({ handler: "human", mode: "consult", letter: "C" }),
    mk({ handler: "human", mode: "inform", letter: "I" }), mk({ handler: "human", mode: "inform", letter: "I", read_at: "2026-11-26T09:00:00Z" }),
    mk({ handler: "agent", mode: "action" }), mk({ handler: "human", mode: "action", status: "done" }),
  ];
  assert.deepEqual(countsOf(items), { todo: 3, info: 1, agent: 1 });
});
