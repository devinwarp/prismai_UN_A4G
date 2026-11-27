import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileKbStore } from "../src/lib/un/kb-store.ts";
import { loadSop, primeSop } from "../src/lib/un/sop-kb.ts";
import { buildLiveSopKb, checkLiveSopKb, ensureLiveSop, liveChunks, loadLiveSopKb, writeLiveSkill, type LiveBuildInput } from "../src/lib/un/sop-kb-live.ts";

// An SOP a person uploaded gets its knowledge base built inside the app (chunks, vectors, stored), so an agent can read it and a skill can be
// extracted from it, without the command-line script. The embedder is faked here; the real one is the same function the country build uses.

const body = readFileSync("data/sops/uc02-trade-licence-renewal-sop.md", "utf8");
const store = () => fileKbStore(path.join(mkdtempSync(path.join(os.tmpdir(), "kb-live-")), "kb.json"));
const input = (sopId: string, over: Partial<LiveBuildInput> = {}): LiveBuildInput => ({ sopId, title: "Uploaded SOP", version: 1, body, useCaseExt: "UC09", entity: "Sahel Federal Workforce Agency", ...over });
const embed = async (texts: string[]) => texts.map((t, i) => [i + 1, t.length, 0.5]);
const noEmbed = async () => null;
const PROFILE = "Document Verification Analyst";

test("an uploaded SOP is chunked with the entity as jurisdiction, ids led by its own id, and a citation that names the stored version", () => {
  const chunks = liveChunks(input("custom-a"));
  assert.ok(chunks.length > 20);
  assert.ok(chunks.every((c) => c.chunk_id.startsWith("custom-a#") && c.source_id === "custom-a"));
  assert.ok(chunks.every((c) => c.jurisdiction === "Sahel Federal Workforce Agency" && c.issuer === "Sahel Federal Workforce Agency"));
  assert.ok(chunks.every((c) => c.url === "sop://custom-a/v1" && c.use_case_id === "UC09"));
  assert.ok(!chunks.some((c) => /Annex A/.test(c.text)), "the Annex stays out: it is the answer key");
});

test("a build with vectors stores the chunks and is ready for an automated agent", async () => {
  const s = store();
  const r = await buildLiveSopKb(s, input("custom-b"), embed);
  assert.equal(r.stored && r.vectors && r.ready, true);
  assert.ok(r.chunks > 20);
  assert.equal((await s.getSop("custom-b"))?.version, "1");
  const rows = await s.listChunks("custom-b");
  assert.equal(rows.length, r.chunks);
  assert.ok(rows.every((x) => x.embedding && x.embedding.length === 3));
  assert.deepEqual(await checkLiveSopKb(s, "custom-b", 1), { ok: true, reason: "vectors current" });
});

test("the knowledge base reads back from the store unchanged and makes loadSop find it in a fresh process", async () => {
  const s = store();
  await buildLiveSopKb(s, input("custom-c"), embed);
  const built = loadSop("custom-c").chunks;
  primeSop("custom-c", { chunks: [], vectors: null }); // a process that has not seen it
  assert.equal(loadSop("custom-c").chunks.length, 0);
  assert.equal(await ensureLiveSop(s, "custom-c", 0), "store");
  const back = loadSop("custom-c");
  assert.deepEqual(back.chunks.map((c) => [c.chunk_id, c.text, c.topics, c.job_profile, c.task_ids, c.chunk_sha256]), built.map((c) => [c.chunk_id, c.text, c.topics, c.job_profile, c.task_ids, c.chunk_sha256]));
  assert.ok(back.vectors && back.vectors.ids.length === built.length);
  const live = await loadLiveSopKb(s, "custom-c");
  assert.equal(live?.chunks.length, built.length);
});

test("a repo SOP that is built on disk is used as it is, never replaced from the store", async () => {
  assert.equal(await ensureLiveSop(store(), "SOP-LIC-014"), "disk");
  assert.deepEqual((await checkLiveSopKb(store(), "SOP-LIC-014")).ok, true);
});

test("a build that cannot embed stores the chunks but is NOT ready: the control that refuses an unvectorised SOP is kept", async () => {
  const s = store();
  const r = await buildLiveSopKb(s, input("custom-d"), noEmbed);
  assert.equal(r.stored, true);
  assert.equal(r.vectors, false);
  assert.equal(r.ready, false);
  assert.match(r.reason, /WITHOUT vectors/);
  const c = await checkLiveSopKb(s, "custom-d", 1);
  assert.equal(c.ok, false);
  assert.match(c.reason, /embedding model was not available when it was built/);
  const k = await writeLiveSkill(s, "custom-d", PROFILE, 1);
  assert.equal(k.ok, false);
});

test("an embedder that throws leaves the chunks stored and the knowledge base not ready", async () => {
  const s = store();
  const r = await buildLiveSopKb(s, input("custom-e"), async () => { throw new Error("model crashed"); });
  assert.deepEqual([r.stored, r.vectors, r.ready], [true, false, false]);
});

test("the knowledge base is checked against the version the use case is on", async () => {
  const s = store();
  await buildLiveSopKb(s, input("custom-f", { version: 1 }), embed);
  const stale = await checkLiveSopKb(s, "custom-f", 2);
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /version 1 but the SOP is at version 2/);
});

test("a rebuild replaces every chunk, so no passage of the old version is left behind", async () => {
  const s = store();
  await buildLiveSopKb(s, input("custom-g", { version: 1 }), embed);
  const changed = body.split("Document Verification Analyst").join("Document Verification Lead");
  const r = await buildLiveSopKb(s, input("custom-g", { version: 2, body: changed }), embed);
  assert.equal(r.ready, true);
  const rows = await s.listChunks("custom-g");
  assert.ok(rows.every((x) => !/Document Verification Analyst/.test(x.text)), "no chunk of version 1 remains");
  assert.ok(rows.some((x) => /Document Verification Lead/.test(x.text)));
  assert.equal((await s.getSop("custom-g"))?.version, "2");
  assert.equal((await checkLiveSopKb(s, "custom-g", 2)).ok, true);
});

test("a skill for a job profile is assembled from the stored chunks, with nothing written to disk and only its hash recorded", async () => {
  const s = store();
  await buildLiveSopKb(s, input("custom-h"), embed);
  const k = await writeLiveSkill(s, "custom-h", PROFILE, 1);
  assert.equal(k.ok, true);
  if (!k.ok) return;
  assert.equal(k.written, false);
  assert.match(k.path, /^kb\/sop\/custom-h\/skills\/custom-h-document-verification-analyst\.SKILL\.md$/);
  assert.match(k.sha256, /^[0-9a-f]{64}$/);
  const again = await writeLiveSkill(s, "custom-h", PROFILE, 1);
  assert.ok(again.ok && again.sha256 === k.sha256, "the same chunks give the same skill hash");
});

test("a job profile that is not in the SOP is refused with a reason", async () => {
  const s = store();
  await buildLiveSopKb(s, input("custom-i"), embed);
  const k = await writeLiveSkill(s, "custom-i", "Chief Wizard", 1);
  assert.equal(k.ok, false);
  if (!k.ok) assert.match(k.reason, /no job profile named "Chief Wizard"/);
});

test("an empty SOP and an SOP with no headings are reported, not thrown", async () => {
  const s = store();
  const r = await buildLiveSopKb(s, input("custom-j", { body: "   " }), embed);
  assert.equal(r.stored, false);
  assert.match(r.reason, /no text before its Annex|could not be built/);
  assert.equal((await s.getSop("custom-j")), null);
});

test("a store that was seeded from disk (titles only) is not mistaken for a live build", async () => {
  const s = store();
  await s.putSop({ sop_id: "seeded-k", title: "Seeded", version: "1", issuer: "x", source_path: "x", source_sha256: "x", synthetic: true });
  await s.putChunks("seeded-k", [{ chunk_id: "seeded-k#S1", sop_id: "seeded-k", text: "t", sha256: "h", topics: ["purpose"], meta: { title: "t", job_profile: null, version: "1" }, embedding: [1, 2, 3] }]);
  assert.equal(await loadLiveSopKb(s, "seeded-k"), null);
  assert.equal(await ensureLiveSop(s, "seeded-k", 0), "none");
  assert.equal((await checkLiveSopKb(s, "seeded-k")).ok, false);
});
