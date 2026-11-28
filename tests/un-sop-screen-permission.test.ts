import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { can } from "../src/lib/un/authz.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the SOP screens offer editing on the permission their APIs check (entity.setup), not to organisation admins only", () => {
  for (const route of ["profiles", "sop-structure"]) assert.match(read(`src/app/api/admin/un/use-cases/[id]/${route}/route.ts`), /requirePermission\("entity\.setup", \{ useCaseId: id \}\)/);
  assert.match(read("src/app/admin/federal/use-cases/[id]/sop/page.tsx"), /const canEdit = perms\.can\("entity\.setup", id\);/);
  const setup = read("src/app/admin/federal/setup/page.tsx");
  assert.match(setup, /const canSetupSops = !!entity && perms\.can\("entity\.setup", undefined, entity\.name\);/);
  assert.match(setup, /<SopIntake [^>]*canEdit=\{canSetupSops\}/);
  assert.match(setup, /<AutomationConfirm rows=\{automation\} canEdit=\{canSetupSops\}/);
});

test("entity setup is the entity's own administrator's, not another entity's, a viewer's or a process owner's", () => {
  const who = (role: "entity_admin" | "process_owner", entity: string) => ({ legacyRole: "employee", assignments: [{ role, scope: { kind: "entity" as const, entity } }] });
  const here = { use_case_id: "u13", entity: "Qanat", country: "UAE" };
  assert.equal(can(who("entity_admin", "Qanat"), "entity.setup", here).ok, true);
  assert.equal(can(who("entity_admin", "Marsa"), "entity.setup", here).ok, false);
  assert.equal(can(who("process_owner", "Qanat"), "entity.setup", here).ok, false);
  assert.equal(can({ legacyRole: "viewer", assignments: [] }, "entity.setup", here).ok, false);
});
