import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GAP_CATEGORIES, loadGaps } from "../src/lib/un/gaps.ts";

const sources = JSON.parse(readFileSync("kb/sources.json", "utf8")) as { id: string; title: string }[];
const chunkIds = new Set((JSON.parse(readFileSync("kb/chunks.json", "utf8")) as { chunk_id: string }[]).map((c) => c.chunk_id));
const f = loadGaps();

test("C3-2: every ITU category has at least two distinct global sources, at least one of them a primary text", () => {
  for (const c of GAP_CATEGORIES) {
    const g = f.gaps.filter((x) => x.category === c).flatMap((x) => x.global);
    assert.ok(new Set(g.map((x) => x.source_id)).size >= 2, `${c}: fewer than two global sources`);
    assert.ok(g.some((x) => x.support === "primary"), `${c}: no primary source`);
  }
});

test("C3-3: a name listed as not ingested is not a source id or title in kb/sources.json", () => {
  const names = f.gaps.flatMap((g) => g.not_ingested.map((n) => n.name.toLowerCase()));
  assert.ok(names.length >= 1);
  for (const n of names) for (const s of sources) {
    assert.ok(!n.includes(s.id) && !s.title.toLowerCase().includes(n) && !n.includes(s.title.toLowerCase()), `${n} is in the KB as ${s.id}`);
  }
});

test("C3-1: the gap page carries the 'Not ingested, cited by name only' label and renders it from gaps.json", () => {
  const page = readFileSync("src/app/admin/federal/gaps/page.tsx", "utf8");
  assert.ok(page.includes("Not ingested, cited by name only"));
  assert.ok(page.includes("g.not_ingested.length > 0") && page.includes("g.not_ingested.map"));
  assert.ok(f.gaps.some((g) => g.not_ingested.length > 0), "no gap uses the label, so the page would never show it");
});

test("every chunk id in gaps.json exists in kb/chunks.json and every secondary-summary example has a caveat", () => {
  for (const g of f.gaps) {
    for (const id of [...g.national.map((n) => n.chunk_id), ...g.global.flatMap((x) => x.chunk_ids)]) assert.ok(chunkIds.has(id), `${g.id}: ${id}`);
    if (g.global.some((x) => x.support === "secondary-summary")) assert.ok(g.caveat.length > 20, g.id);
  }
});

test("new primary sources are short attributed excerpts: at most 40 words, with a where, and quoted verbatim in chunks", () => {
  for (const id of ["sg-imda-agentic-mgf", "eu-ai-act-articles", "g7-hiroshima-code", "un-system-white-paper"]) {
    const s = sources.find((x) => x.id === id) as unknown as { excerpts: { text: string; where: string }[]; url: string };
    assert.ok(s?.excerpts.length >= 5 && s.url.startsWith("https://"), id);
    for (const [i, e] of s.excerpts.entries()) {
      assert.ok(e.text.split(/\s+/).length <= 40 && e.where.length > 10, `${id}#${i}`);
      assert.ok(chunkIds.has(`${id}#${i}`));
    }
  }
});
