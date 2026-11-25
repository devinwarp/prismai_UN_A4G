import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { affected, diffLines, planManualVersion, planNewVersion, type SopVersion } from "../src/lib/un/sop/versions.ts";
import { loadBaseline, profilesOf, sampleInput } from "../src/lib/un/sop/data.ts";

const ENTITY = "Marsa Public Services Authority";
const baseline = loadBaseline();
const text1 = sampleInput("SOP-LIC-014")!.text;
const v1: SopVersion = { sop_id: "SOP-LIC-014", version: 1, title: "Trade licence renewal", body: text1, profiles: profilesOf("SOP-LIC-014")!, changes: null };
const names = v1.profiles.map((p) => p.name);

// edit the text by task section: each "### T01. ..." section names its job profile on a "**Job profile:**" line
const sections = text1.split(/^(?=### T\d{2}\.)/m);
const head = sections[0];
const task = sections.slice(1);
const profileOf = (s: string) => /\*\*Job profile:\*\*\s*([^.\n]+)/.exec(s)?.[1].trim();
const rebuild = (parts: string[]) => head + parts.join("");

test("the sample SOP gives four job profiles by task section, which is what the tests below edit", () => {
  assert.equal(v1.profiles.length, 4);
  assert.ok(task.every((s) => profileOf(s)));
});

test("a new text changes only the profiles it touches: one changed, one removed, one added, the rest kept exactly as they were", () => {
  const supervisor = "Licensing Supervisor";
  const fee = "Fee and Payment Officer";
  assert.ok(names.includes(supervisor) && names.includes(fee));
  const edited = task
    .filter((s) => profileOf(s) !== supervisor) // the supervisor's tasks are gone
    .map((s) => (profileOf(s) === fee ? s.replace(/^(### T\d{2}\.\s+)(.+)$/m, "$1$2 and issue a payment receipt to the applicant in writing") : s));
  const added = `### T90. Review an appeal against a refusal\n\n**Job profile:** Appeals Officer.\n\nThe appeals officer reviews the appeal and tells the applicant the outcome in writing.\n\n`;
  const r = planNewVersion(v1, { text: rebuild([...edited, added]), entity: ENTITY, baseline });
  assert.ok(r.ok, r.ok ? "" : r.error);
  const c = r.version.changes!;
  assert.equal(r.version.version, 2);
  assert.equal(c.from, 1);
  assert.deepEqual(c.profiles.added, ["Appeals Officer"]);
  assert.deepEqual(c.profiles.removed, [supervisor]);
  assert.deepEqual(c.profiles.changed, [fee]);
  assert.deepEqual(c.profiles.unchanged.sort(), names.filter((n) => n !== supervisor && n !== fee).sort());
  assert.deepEqual(r.version.profiles.map((p) => p.name).sort(), [...names.filter((n) => n !== supervisor), "Appeals Officer"].sort());
  // an unchanged profile is the very same one: same tasks, same ids
  for (const n of c.profiles.unchanged) assert.deepEqual(r.version.profiles.find((p) => p.name === n), v1.profiles.find((p) => p.name === n), n);
  // task ids stay unique across the SOP
  const ids = r.version.profiles.flatMap((p) => p.tasks.map((t) => t.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(affected(c).sort(), ["Appeals Officer", supervisor, fee].sort());
  assert.ok(c.lines.added.length > 0 && c.lines.removed.length > 0, "the text diff names the lines");
});

test("a task whose wording did not change keeps its id when its profile changes", () => {
  const fee = "Fee and Payment Officer";
  const before = v1.profiles.find((p) => p.name === fee)!;
  const first = task.find((s) => profileOf(s) === fee)!;
  const bumped = task.map((s) => (s === first ? s + "\nThe officer also records the payment reference in the file.\n" : s));
  const r = planNewVersion(v1, { text: rebuild(bumped), entity: ENTITY, baseline });
  assert.ok(r.ok);
  const after = r.version.profiles.find((p) => p.name === fee)!;
  for (const t of before.tasks.filter((x) => after.tasks.some((y) => y.title === x.title))) assert.equal(after.tasks.find((y) => y.title === t.title)!.id, t.id, t.title);
});

test("an admin's own edit of a profile survives a new text that does not touch it, and a hand-added profile is kept", () => {
  const edit = planManualVersion(v1, { type: "add", name: "Quality Reviewer", tasks: "Check a sample of renewals every week" });
  assert.ok(edit.ok);
  const v2 = edit.version;
  assert.equal(v2.version, 2);
  assert.deepEqual(v2.changes!.profiles.added, ["Quality Reviewer"]);
  assert.deepEqual(v2.changes!.manual, { type: "add", name: "Quality Reviewer" });
  assert.equal(v2.body, v1.body, "a manual edit leaves the text alone");
  const r = planNewVersion(v2, { text: text1 + "\n\nNote: the fee schedule is published on the portal.\n", entity: ENTITY, baseline });
  assert.ok(r.ok);
  assert.deepEqual(r.version.changes!.profiles.kept_manual, ["Quality Reviewer"]);
  assert.ok(r.version.profiles.some((p) => p.name === "Quality Reviewer"), "no text removed it, so it stays");
  assert.equal(r.version.version, 3);
});

test("a text that is the same, empty, huge, or has no steps or profiles is refused", () => {
  assert.ok(!planNewVersion(v1, { text: text1, entity: ENTITY, baseline }).ok, "the same as the last version");
  assert.ok(!planNewVersion(v1, { text: "", entity: ENTITY, baseline }).ok);
  assert.ok(!planNewVersion(v1, { text: "x".repeat(200_001), entity: ENTITY, baseline }).ok);
  assert.ok(!planNewVersion(v1, { text: "Just some prose with nothing in it that is a procedure.", entity: ENTITY, baseline }).ok);
});

test("a manual edit makes a new version of the same SOP; it does not change the one before", () => {
  const before = JSON.stringify(v1);
  const r = planManualVersion(v1, { type: "remove", name: names[0] });
  assert.ok(r.ok && r.version.profiles.length === 3 && r.version.changes!.profiles.removed[0] === names[0]);
  assert.equal(JSON.stringify(v1), before, "version 1 is untouched");
  assert.ok(!planManualVersion({ ...v1, profiles: [v1.profiles[0]] }, { type: "remove", name: names[0] }).ok, "the last profile stays");
  const rn = planManualVersion(v1, { type: "update", name: names[1], new_name: "Renamed Analyst" });
  assert.ok(rn.ok && rn.version.changes!.profiles.changed[0] === "Renamed Analyst");
});

test("diffLines names what changed and caps the list", () => {
  const d = diffLines("a line\nsame\n", "same\nnew line\n");
  assert.deepEqual(d, { added: ["new line"], removed: ["a line"], more: 0 });
  const many = diffLines("", Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n"));
  assert.equal(many.added.length, 40);
  assert.equal(many.more, 20);
  assert.equal(readFileSync("src/lib/un/sop/versions.ts", "utf8").includes("FROZEN"), true);
});
