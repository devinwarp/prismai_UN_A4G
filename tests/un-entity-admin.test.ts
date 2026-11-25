import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { entitiesOf, goalPrefix, normalizeGoals, parseJobTitle, peopleOfEntity, planEntity, planMember, MAX_GOALS, type MemberRow } from "../src/lib/un/entity-admin.ts";
import { AR } from "../src/lib/un/i18n/dict.ts";

const known = ["Marsa Public Services Authority", "Qanat Transport and Mobility Agency"];

test("goal ids use the first word of the entity name; kept ids stay, new ones take the next free number; each goal needs text and a real criterion", () => {
  assert.equal(goalPrefix("Marsa Public Services Authority"), "MARSA");
  assert.equal(goalPrefix("  al-Noor & Co "), "ALNOOR");
  assert.equal(goalPrefix("!!!"), "ENTITY");
  const r = normalizeGoals("Marsa Public Services Authority", [
    { id: "MARSA-G1", text: "Achieve 99% citizen satisfaction", criterion: null },
    { text: "Never invent a fee or a service", criterion: "hallucination" },
    { id: "MARSA-G1", text: "A duplicate id gets a fresh one", criterion: "" },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.goals.map((g) => g.id), ["MARSA-G1", "MARSA-G2", "MARSA-G3"]);
  assert.deepEqual(r.goals.map((g) => g.criterion), [null, "hallucination", null]);
  for (const bad of [[], "x", [{ text: "ok", criterion: null }], [{ text: "A goal long enough", criterion: "goal_alignment" }], [{ text: "A goal long enough", criterion: "nope" }], Array.from({ length: MAX_GOALS + 1 }, () => ({ text: "A goal long enough" }))]) {
    assert.equal(normalizeGoals("X", bad).ok, false, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(normalizeGoals("X", [{ text: "x".repeat(301) }]).ok, false);
});

test("adding an entity: a unique name of 3 to 120 characters, optional sector and goals", () => {
  const o = { known, hidden: [] as string[] };
  for (const name of ["ab", "", "x".repeat(121), "marsa public services authority", "  Marsa   Public Services  Authority "]) {
    assert.equal(planEntity({ type: "add", name }, o).ok, false, name);
  }
  const p = planEntity({ type: "add", name: "  Nour   Digital Agency ", sector: " Digital ", goals: [{ text: "Answer within four hours", criterion: null }] }, o);
  assert.ok(p.ok && p.type === "add");
  assert.equal(p.row.name, "Nour Digital Agency");
  assert.equal(p.row.sector, "Digital");
  assert.equal(p.row.goals[0].id, "NOUR-G1");
  assert.equal(p.row.hidden, false);
  const bare = planEntity({ type: "add", name: "Bare Entity" }, o);
  assert.ok(bare.ok && bare.type === "add" && bare.row.goals.length === 0 && bare.row.sector === null);
  assert.equal(planEntity({ type: "add", name: "Bad Goals", goals: [{ text: "no" }] }, o).ok, false);
});

test("editing goals and hiding: only a known entity; hiding is a switch that reports when nothing changes", () => {
  const o = { known, hidden: ["Qanat Transport and Mobility Agency"] };
  const nope = planEntity({ type: "set_goals", name: "Nowhere", goals: [{ text: "A goal long enough" }] }, o);
  assert.ok(!nope.ok && nope.status === 404);
  assert.equal(planEntity({ type: "set_goals", name: known[0], goals: [] }, o).ok, false, "at least one goal");
  const g = planEntity({ type: "set_goals", name: known[0], goals: [{ id: "MARSA-G9", text: "Reply to every citizen within a day", criterion: "accuracy" }] }, o);
  assert.ok(g.ok && g.type === "set_goals" && g.goals[0].id === "MARSA-G9");
  const h = planEntity({ type: "set_hidden", name: known[0], hidden: true }, o);
  assert.ok(h.ok && h.type === "set_hidden" && h.hidden && !h.noop);
  const again = planEntity({ type: "set_hidden", name: known[1], hidden: true }, o);
  assert.ok(again.ok && again.type === "set_hidden" && again.noop, "already hidden");
  const unhide = planEntity({ type: "set_hidden", name: known[1], hidden: false }, o);
  assert.ok(unhide.ok && unhide.type === "set_hidden" && !unhide.noop);
  assert.equal(planEntity({ type: "set_hidden", name: known[0], hidden: "yes" }, o).ok, false);
});

const row = (o: Partial<MemberRow>): MemberRow => ({ id: "m1", body: "Federal Central Authority", user_id: "u1", added_by: "a", added_at: "2026-01-01T00:00:00.000Z", removed_at: null, removed_by: null, ...o });
test("federal members: a person belongs to a body once at a time, can belong to several, and the history stays", () => {
  const o = { rows: [row({})], knownUsers: ["u1", "u2"], by: "admin" };
  assert.ok(!planMember({ type: "add", body: "federal central authority", user_id: "u1" }, o).ok, "already a member (any case)");
  assert.ok(!planMember({ type: "add", body: "x", user_id: "u2" }, o).ok, "a body name is 2 or more characters");
  assert.ok(!planMember({ type: "add", body: "President's Office", user_id: "ghost" }, o).ok);
  const add = planMember({ type: "add", body: "  President's   Office ", user_id: "u2" }, o);
  assert.ok(add.ok && add.type === "add" && add.row.body === "President's Office" && add.row.added_by === "admin");
  assert.ok(planMember({ type: "add", body: "President's Office", user_id: "u1" }, o).ok, "a person can belong to more than one body");
  const rm = planMember({ type: "remove", member_id: "m1" }, o);
  assert.ok(rm.ok && rm.type === "remove" && rm.removed_by === "admin");
  assert.ok(!planMember({ type: "remove", member_id: "nope" }, o).ok);
  const ended = { ...o, rows: [row({ removed_at: "2026-02-01T00:00:00.000Z", removed_by: "a" })] };
  assert.ok(!planMember({ type: "remove", member_id: "m1" }, ended).ok, "already ended");
  assert.ok(planMember({ type: "add", body: "Federal Central Authority", user_id: "u1" }, ended).ok, "after it ended, the person can be added again");
});

test("an entity's people are not stored: they are whoever holds a live role on one of its use cases", () => {
  const ucs = [{ id: "uc1", entity: "Marsa" }, { id: "uc2", entity: "Marsa" }, { id: "uc3", entity: "Qanat" }];
  const rows = [
    { user_id: "u1", use_case_id: "uc1", revoked_at: null },
    { user_id: "u1", use_case_id: "uc3", revoked_at: null },
    { user_id: "u2", use_case_id: "uc2", revoked_at: null },
    { user_id: "u2", use_case_id: "uc3", revoked_at: "2026-01-01T00:00:00.000Z" },
    { user_id: "u3", use_case_id: null, revoked_at: null },
  ];
  assert.deepEqual(entitiesOf("u1", rows, ucs), ["Marsa", "Qanat"], "a person can work at more than one entity");
  assert.deepEqual(entitiesOf("u2", rows, ucs), ["Marsa"], "a revoked role no longer counts");
  assert.deepEqual(entitiesOf("u3", rows, ucs), [], "a platform-wide role links to no entity: such a person is a federal member instead");
  assert.deepEqual(peopleOfEntity("Marsa", rows, ucs).sort(), ["u1", "u2"]);
  assert.deepEqual(peopleOfEntity("Qanat", rows, ucs), ["u1"]);
  assert.deepEqual(peopleOfEntity("Nowhere", rows, ucs), []);
});

test("a job title is trimmed text of 2 to 80 characters; empty clears it", () => {
  assert.deepEqual(parseJobTitle("  Licensing   Officer "), { ok: true, title: "Licensing Officer" });
  assert.deepEqual(parseJobTitle("   "), { ok: true, title: null });
  assert.equal(parseJobTitle("x").ok, false);
  assert.equal(parseJobTitle("x".repeat(81)).ok, false);
  assert.equal(parseJobTitle(5).ok, false);
});

test("the entity and people routes are admin-gated and write to the hash-chained log; the screens' new strings have Arabic", () => {
  const ent = readFileSync("src/app/api/admin/un/entities/route.ts", "utf8");
  assert.match(ent, /requireAdmin\(\)/);
  assert.ok(ent.indexOf("await requireAdmin()") < ent.indexOf("await loadKnownEntities"));
  assert.match(ent, /recordChange/);
  const ppl = readFileSync("src/app/api/admin/un/people/route.ts", "utf8");
  assert.match(ppl, /requirePermission\("users\.manage"\)/);
  assert.ok(ppl.indexOf("await requirePermission(\"users.manage\")") < ppl.indexOf("await loadPeople"));
  assert.match(ppl, /recordChange/);
  assert.match(ppl, /add_federal/);
  assert.doesNotMatch(ppl, /un_entity_members|add_member/, "an entity's people are derived from roles, not stored");
  for (const f of ["src/app/admin/federal/goals/EntityAdmin.tsx", "src/app/admin/federal/people/PeopleEntities.tsx"]) {
    const keys = [...new Set([...readFileSync(f, "utf8").matchAll(/"((?:en|pm)\.[\w.]+)"/g)].map((m) => m[1]))];
    assert.ok(keys.length > 5, f);
    for (const k of keys) assert.ok(AR[k], `no Arabic for ${k}`);
  }
  assert.match(readFileSync("src/app/admin/federal/page.tsx", "utf8"), /loadHiddenEntities/, "the dashboard leaves hidden entities out");
  const sql = readFileSync("supabase/un-entities-admin.sql", "utf8");
  assert.match(sql, /add column if not exists hidden/);
  assert.match(sql, /create table if not exists public\.un_federal_members/);
  assert.doesNotMatch(sql, /un_entity_members/);
});
