import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chunkSop, extractSkill, loadSop, requireVectorised, searchSop, searchSopForAgent, sopMetaFrom, vectorStatus, type SopChunk, type SopVectorFile } from "../src/lib/un/sop-kb.ts";

const FILE = "data/sops/uc02-trade-licence-renewal-sop.md";
const md = readFileSync(FILE, "utf8");
const meta = sopMetaFrom(md, FILE);
const chunks = chunkSop(md, meta);
const id = (k: string) => `${meta.sopId}#${k}`;

test("SOP chunking: one chunk per task T01 to T20, unique ids, annex excluded", () => {
  const ids = chunks.map((c) => c.chunk_id);
  assert.equal(new Set(ids).size, ids.length);
  for (let n = 1; n <= 20; n++) assert.ok(ids.includes(id(`T${String(n).padStart(2, "0")}`)), `T${n}`);
  assert.ok(!chunks.some((c) => /Suggested for automation|Reference breakdown|answer key/i.test(c.text)), "annex must not be retrievable");
  assert.ok(chunks.every((c) => c.synthetic && c.use_case_id === "UC02" && c.text.startsWith("SOP-LIC-014 v")));
});

test("SOP chunking: documents, rules and questions are separate citable chunks", () => {
  for (const k of ["D1", "D2", "D3", "D4", "D5", "D6", "SUB", "VAL", "R1", "R7", "Q1", "Q10"]) assert.ok(chunks.some((c) => c.chunk_id === id(k)), k);
  assert.equal(chunks.find((c) => c.chunk_id === id("T10"))!.job_profile, "Document Verification Analyst");
});

test("SOP retrieval (BM25): the questions an agent must answer reach the right chunk", async () => {
  // run against the built store, so this also fails if kb/sop is stale
  const top = async (q: string) => (await searchSop(meta.sopId, q, { k: 3 })).hits.map((h) => h.chunk.chunk_id);
  assert.ok((await top("what documents are required to renew a trade licence")).some((x) => [id("S10"), id("D1"), id("Q1"), id("T05"), id("T03")].includes(x)));
  assert.ok((await top("how can I upload or send my documents")).some((x) => [id("SUB"), id("Q2")].includes(x)));
  assert.ok((await top("insurance certificate minimum cover")).includes(id("D4")));
  assert.ok((await top("who decides whether to approve a renewal")).some((x) => [id("R1"), id("T15")].includes(x)));
});

test("mandatory vectorisation: the built SOP is vectorised and current; stale or missing vectors are refused", () => {
  requireVectorised(meta.sopId);
  const { chunks: stored, vectors } = loadSop(meta.sopId);
  assert.equal(stored.length, chunks.length, "kb/sop is out of date: run scripts/build_sop_kb.ts");
  assert.ok(stored.every((c, i) => c.chunk_sha256 === chunks[i].chunk_sha256), "kb/sop is out of date: run scripts/build_sop_kb.ts");
  assert.equal(vectorStatus(stored, vectors as SopVectorFile).ok, true);
  assert.equal(vectorStatus(stored, null).ok, false);
  const edited: SopChunk[] = stored.map((c, i) => (i === 3 ? { ...c, chunk_sha256: "changed" } : c));
  assert.match(vectorStatus(edited, vectors as SopVectorFile).reason, /out of date/);
  assert.throws(() => requireVectorised("SOP-DOES-NOT-EXIST"), /cannot be used by an automated agent/);
});

test("agent retrieval refuses to fall back to keyword search", async () => {
  const saved = process.env.KB_VECTOR;
  delete process.env.KB_VECTOR;
  await assert.rejects(searchSopForAgent(meta.sopId, "documents required"), /vector retrieval is required/);
  if (saved !== undefined) process.env.KB_VECTOR = saved;
});

test("skill extraction: the profile's own tasks, verbatim, with its limits; unknown profile or unvectorised SOP refused", () => {
  const s = extractSkill(meta.sopId, "Document Verification Analyst");
  assert.equal(s.name, "sop-lic-014-document-verification-analyst");
  for (const t of ["T04", "T05", "T06", "T07", "T08", "T09", "T10"]) assert.ok(s.markdown.includes(`### ${t}`), t);
  for (const t of ["T01", "T11", "T15", "T20"]) assert.ok(!s.markdown.includes(`### ${t}`), `${t} belongs to another profile`);
  assert.ok(s.markdown.includes("May not approve or reject a renewal"));
  assert.ok(s.markdown.includes("registered email address on the licence record"));
  assert.ok(s.markdown.includes(`source_sha256: ${chunks[0].sha256}`));
  assert.ok(!/Suggested for automation/.test(s.markdown));
  assert.ok(s.markdown.includes("request_outside_information") && s.markdown.includes("Thought, Action, Observation"));
  assert.throws(() => extractSkill(meta.sopId, "Chief Wizard"), /no job profile/);
  assert.throws(() => extractSkill("SOP-DOES-NOT-EXIST", "Document Verification Analyst"), /cannot be used by an automated agent/);
});
