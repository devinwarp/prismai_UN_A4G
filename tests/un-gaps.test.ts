import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { GAP_CATEGORIES, loadGaps, validateGaps } from "../src/lib/un/gaps.ts";

const chunks = JSON.parse(readFileSync("kb/chunks.json", "utf8")) as { chunk_id: string }[];
const sources = JSON.parse(readFileSync("kb/sources.json", "utf8")) as { id: string }[];
const ids = new Set(chunks.map((c) => c.chunk_id));
const sids = new Set(sources.map((s) => s.id));
const f = loadGaps();

test("every chunk id and global source id in gaps.json exists in the KB", () => {
  assert.deepEqual(validateGaps(f, ids, sids), []);
});

test("the validator catches an unknown chunk and source", () => {
  const bad = structuredClone(f);
  bad.gaps[0].national[0].chunk_id = "nope#9";
  bad.gaps[1].global[0].source_id = "nope";
  assert.equal(validateGaps(bad, ids, sids).length >= 2, true);
});

test("all six ITU categories are covered with 8-10 gaps", () => {
  assert.deepEqual(Object.keys(f.categories).sort(), [...GAP_CATEGORIES].sort());
  for (const c of GAP_CATEGORIES) assert.ok(f.gaps.some((g) => g.category === c), c);
  assert.ok(f.gaps.length >= 8 && f.gaps.length <= 10);
  assert.equal(new Set(f.gaps.map((g) => g.id)).size, f.gaps.length);
});

test("each gap has evidence, a Prism response pointing at real files, and a caveat", () => {
  for (const g of f.gaps) {
    assert.ok(g.national.length > 0 && g.global.length > 0 && g.caveat && g.prism.response, g.id);
    for (const r of g.prism.refs) assert.ok(existsSync(r.path), `${g.id}: ${r.path}`);
    if (g.global.some((x) => x.support === "secondary-summary")) assert.ok(g.caveat.length > 20, g.id);
  }
});
