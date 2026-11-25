import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { customSopFromText, nextTaskId, parseTaskLines, planProfileEdit, MAX_PROFILES, MAX_TASKS } from "../src/lib/un/sop/custom.ts";
import { loadBaseline, profilesOf, sampleInput } from "../src/lib/un/sop/data.ts";
import { AR } from "../src/lib/un/i18n/dict.ts";

const lic = profilesOf("SOP-LIC-014")!;
const titles = (p: { tasks: { title: string }[] }) => p.tasks.map((t) => t.title);

test("a pasted SOP gets job profiles from its steps and a unique id; empty, huge or profile-less text is refused", () => {
  const text = readFileSync("data/sop/sop-records-archive.md", "utf8");
  const base = { entity: "Marsa Public Services Authority", baseline: loadBaseline(), idBase: "UC09", takenIds: [] as string[] };
  const ok = customSopFromText({ ...base, title: "Records archive (mine)", text });
  assert.ok(ok.ok);
  assert.match(ok.sop_id, /^custom-uc09-records-archive-mine/);
  assert.ok(ok.profiles.length >= 1 && ok.profiles.every((p) => p.tasks.length >= 1 && p.name));
  const again = customSopFromText({ ...base, title: "Records archive (mine)", text, takenIds: [ok.sop_id] });
  assert.ok(again.ok && again.sop_id === `${ok.sop_id}-2`, "a second SOP with the same title gets its own id");
  assert.equal(customSopFromText({ ...base, title: "x", text: "" }).ok, false);
  assert.equal(customSopFromText({ ...base, title: "Big", text: "x".repeat(200_001) }).ok, false);
  assert.equal(customSopFromText({ ...base, title: "ab", text }).ok, false, "a title of at least 3 characters");
  assert.equal(customSopFromText({ ...base, title: "No steps", text: "Just some prose with no procedure in it at all." }).ok, false);
});

test("task lines: one per line, trimmed, 3 to 200 characters, at least one, at most the limit", () => {
  assert.deepEqual(parseTaskLines("  Check the file \n\n  Send the notice  ".split("\n")), { ok: true, titles: ["Check the file", "Send the notice"] });
  assert.deepEqual(parseTaskLines("Check the file\r\nSend the notice"), { ok: true, titles: ["Check the file", "Send the notice"] });
  assert.equal(parseTaskLines("").ok, false);
  assert.equal(parseTaskLines("ab").ok, false);
  assert.equal(parseTaskLines("x".repeat(201)).ok, false);
  assert.equal(parseTaskLines(Array.from({ length: MAX_TASKS + 1 }, (_, i) => `Task number ${i + 1}`)).ok, false);
  assert.equal(parseTaskLines(7).ok, false);
});

test("adding a job profile: a unique name, tasks with fresh ids across the SOP, flags worked out from the wording; the input is not changed", () => {
  const before = JSON.stringify(lic);
  const p = planProfileEdit(lic, { type: "add", name: "  Appeals   Officer ", tasks: "Review the appeal against the decision\nTell the applicant by email in writing" });
  assert.ok(p.ok && p.change.type === "add");
  assert.equal(p.profiles.length, lic.length + 1);
  const added = p.profiles.at(-1)!;
  assert.equal(added.name, "Appeals Officer");
  const allIds = p.profiles.flatMap((x) => x.tasks.map((t) => t.id));
  assert.equal(new Set(allIds).size, allIds.length, "task ids are unique across the SOP");
  assert.match(added.tasks[0].id, /^T\d{2,}$/);
  assert.equal(JSON.stringify(lic), before, "the original list is untouched");
  assert.equal(planProfileEdit(lic, { type: "add", name: lic[0].name.toUpperCase(), tasks: "Do the work here" }).ok, false, "names are unique in any case");
  assert.equal(planProfileEdit(lic, { type: "add", name: "x", tasks: "Do the work here" }).ok, false);
  assert.equal(planProfileEdit(lic, { type: "add", name: "Fine Name", tasks: "" }).ok, false);
  const many = Array.from({ length: MAX_PROFILES }, (_, i) => ({ name: `P${i}`, tasks: [{ id: `T${i + 1}`, title: "t", flags: { client_facing: false, affects_rights: false, irreversible: false } }], flags: { client_facing: false, affects_rights: false, irreversible: false } }));
  assert.equal(planProfileEdit(many, { type: "add", name: "One More", tasks: "Do the work here" }).ok, false, "at most MAX_PROFILES");
});

test("updating a job profile: rename and rewrite its tasks; unchanged tasks keep their ids, reworded ones get new ones; flags follow the wording", () => {
  const target = lic.find((p) => p.tasks.length >= 2)!;
  const keep = target.tasks[0];
  const p = planProfileEdit(lic, { type: "update", name: target.name, new_name: "Renamed Officer", tasks: [keep.title, "Tell the applicant in writing that the licence will be refused"] });
  assert.ok(p.ok && p.change.type === "update" && p.change.new_name === "Renamed Officer");
  const upd = p.profiles.find((x) => x.name === "Renamed Officer")!;
  assert.equal(upd.tasks[0].id, keep.id, "an unchanged task keeps its id");
  assert.notEqual(upd.tasks[1].id, keep.id);
  const allIds = p.profiles.flatMap((x) => x.tasks.map((t) => t.id));
  assert.equal(new Set(allIds).size, allIds.length);
  assert.ok(upd.tasks[1].flags.client_facing, "writing to the applicant is client-facing");
  assert.equal(upd.flags.client_facing, upd.tasks.some((t) => t.flags.client_facing), "a profile's flag is on if any task has it");
  assert.equal(p.profiles.length, lic.length);
  const rename = planProfileEdit(lic, { type: "update", name: target.name, new_name: lic.find((x) => x !== target)!.name });
  assert.ok(!rename.ok && rename.status === 409, "cannot take another profile's name");
  assert.equal(planProfileEdit(lic, { type: "update", name: "Nobody", new_name: "Somebody" }).ok, false);
  const same = planProfileEdit(lic, { type: "update", name: target.name, tasks: titles(target) });
  assert.ok(same.ok && JSON.stringify(same.profiles) === JSON.stringify(lic), "saving with no change changes nothing");
});

test("removing a job profile: it must exist and it cannot be the last one", () => {
  const gone = planProfileEdit(lic, { type: "remove", name: lic[0].name });
  assert.ok(gone.ok && gone.profiles.length === lic.length - 1 && !gone.profiles.some((p) => p.name === lic[0].name));
  assert.equal(planProfileEdit(lic, { type: "remove", name: "Nobody" }).ok, false);
  const last = planProfileEdit([lic[0]], { type: "remove", name: lic[0].name });
  assert.ok(!last.ok && last.status === 409);
  assert.equal(nextTaskId([]), "T01");
  assert.equal(nextTaskId(lic, ["T99"]), "T100");
});

test("the shipped samples are never edited in place, the profiles route is admin-only and audited, and every consumer reads the profiles of the version a use case is on", () => {
  assert.ok(sampleInput("SOP-LIC-014"));
  const route = readFileSync("src/app/api/admin/un/use-cases/[id]/profiles/route.ts", "utf8");
  assert.match(route, /await requireAdmin\(\)/);
  for (const a of ["attach", "attach_custom", "new_version", "profile", "tick"]) assert.match(route, new RegExp(`"${a}"`));
  assert.doesNotMatch(route, /"fork"/, "an edit is a new version, not a copy");
  assert.match(route, /recordChange/);
  assert.match(route, /rollOut/);
  assert.match(route, /frozen/);
  const ui = readFileSync("src/app/admin/federal/use-cases/[id]/sop/SopEditor.tsx", "utf8");
  for (const k of new Set([...ui.matchAll(/"((?:sp|sv)\.[\w.]+)"/g)].map((m) => m[1]))) assert.ok(AR[k], `no Arabic for ${k}`);
  for (const f of ["src/lib/un/release-store.ts", "src/lib/un/approvers-store.ts", "src/lib/un/test-set-store.ts", "src/app/admin/federal/use-cases/[id]/pilot/page.tsx", "src/app/admin/federal/use-cases/[id]/tests/page.tsx", "src/app/admin/federal/use-cases/[id]/sop/page.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /profilesForUseCase/, f);
  }
  assert.match(readFileSync("src/lib/un/journey-store.ts", "utf8"), /profileIndex/);
});
