import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { processOwnerOf } from "../src/lib/un/approvers.ts";
import { parseUseCases } from "../src/lib/un/model.ts";

const owners = (JSON.parse(readFileSync("data/un-process-owners.json", "utf8")) as { owners: { use_case: string; entity: string; name: string; job_title: string; email: string }[] }).owners;
const ucs = parseUseCases(readFileSync("data/un-use-cases.csv", "utf8")).useCases;

test("every use case has exactly one process owner, in the entity the use case belongs to", () => {
  assert.equal(owners.length, ucs.length);
  for (const u of ucs) {
    const mine = owners.filter((o) => o.use_case === u.ext_id);
    assert.equal(mine.length, 1, u.ext_id);
    assert.equal(mine[0].entity, u.entity, `${u.ext_id} entity`);
  }
});

test("the owners are fictitious and clean: unique names and addresses, the reserved .example domain, a title that says who they are", () => {
  assert.equal(new Set(owners.map((o) => o.email)).size, owners.length);
  assert.equal(new Set(owners.map((o) => o.name)).size, owners.length);
  for (const o of owners) {
    assert.match(o.email, /^[a-z.]+@[a-z]+\.example$/, o.email);
    assert.ok(o.name.length >= 5 && o.job_title.length >= 8, o.use_case);
    assert.match(o.job_title, /^(Head|Director) of /, o.use_case);
  }
  // one email domain per entity, so a person's address says where they work
  for (const entity of new Set(owners.map((o) => o.entity))) assert.equal(new Set(owners.filter((o) => o.entity === entity).map((o) => o.email.split("@")[1])).size, 1, entity);
});

test("the owner of a use case that has an SOP is the person its SOP names, so the approver rules find them", () => {
  const sop = readFileSync("data/sops/uc02-trade-licence-renewal-sop.md", "utf8");
  assert.equal(owners.find((o) => o.use_case === "UC02")!.job_title, processOwnerOf(sop));
});

test("the seed script is safe to repeat, and writes to the hosted database only when told to", () => {
  const s = readFileSync("scripts/seed-process-owners.mts", "utf8");
  assert.match(s, /if \(!p\) \{/, "a person found by email is reused");
  assert.match(s, /role === "process_owner" && a\.use_case_id === uc\.id && !a\.revoked_at\)\) continue;/, "offline: a live role is not granted twice");
  assert.match(s, /revoked_at=is\.null/, "hosted: a live role is not granted twice");
  assert.match(s, /--hosted/);
  assert.match(s, /DRY RUN/);
  assert.match(s, /if \(!apply\) continue;/, "hosted is a dry run unless --apply");
});
