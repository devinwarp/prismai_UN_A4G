import assert from "node:assert/strict";
import test from "node:test";
import type { Chunk } from "../src/lib/un/kb.ts";
import { cosine, embedQuery, hybridSearch, parseVectors, rrf, vectorRanking, type VectorFile } from "../src/lib/un/vector.ts";

const mk = (id: string, jurisdiction: string, text: string): Chunk => ({
  chunk_id: id, source_id: id.split("#")[0], text, sha256: "x", title: id, url: "u", issuer: "i",
  jurisdiction, instrument_type: "framework", binding: false, date: null, topics: [], matrix_quadrants: [],
});
const chunks = [
  mk("desc#0", "Dubai", "Hosting must use certified cloud infrastructure located in approved regions."),
  mk("charter#0", "UAE-federal", "Systems must remain under human oversight and citizens must be informed."),
  mk("nist#0", "US", "Measure hallucination and robustness of the model in production."),
  mk("eu#0", "EU", "Deployers must assign human oversight to competent persons."),
];
// 3-d toy vectors: axis 0 = hosting, 1 = oversight, 2 = measurement
const vectors: VectorFile = { model: "toy", dim: 3, ids: ["desc#0", "charter#0", "nist#0", "eu#0"], vectors: [[1, 0, 0], [0, 1, 0.1], [0, 0, 1], [0.1, 0.9, 0]] };

test("C1-6: cosine and reciprocal rank fusion behave as defined", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0);
  const s = rrf([["a", "b"], ["b", "c"]]);
  assert.ok(s.get("b")! > s.get("a")! && s.get("b")! > s.get("c")!); // in both lists beats first of one
  assert.equal(s.get("a"), 1 / 61);
});

test("C1-6: vectors find a paraphrase that shares no word with the chunk; fusion keeps the lexical hit too", () => {
  // the query word "datacentre" appears in no chunk, so BM25 returns nothing, but the vector points at hosting
  assert.equal(hybridSearch(chunks, null, null, "datacentre", { k: 2 }).hits.length, 0);
  const r = hybridSearch(chunks, vectors, [0.95, 0.05, 0], "datacentre", { k: 2 });
  assert.equal(r.mode, "hybrid");
  assert.equal(r.hits[0].chunk.chunk_id, "desc#0");
  // a lexical match the vector ranks low still survives: "hallucination" lexically picks nist#0
  const both = hybridSearch(chunks, vectors, [0.95, 0.05, 0], "hallucination robustness", { k: 3 });
  assert.ok(both.hits.some((h) => h.chunk.chunk_id === "nist#0") && both.hits.some((h) => h.chunk.chunk_id === "desc#0"));
});

test("C1-6: with no query vector, no vectors, or the wrong dimension, search is BM25 and says so", () => {
  const plain = hybridSearch(chunks, null, null, "human oversight", { k: 3 });
  assert.equal(plain.mode, "bm25");
  assert.equal(hybridSearch(chunks, vectors, null, "human oversight", { k: 3 }).mode, "bm25");
  assert.equal(hybridSearch(chunks, vectors, [1, 2], "human oversight", { k: 3 }).mode, "bm25");
  assert.deepEqual(hybridSearch(chunks, vectors, null, "human oversight", { k: 3 }).hits.map((h) => h.chunk.chunk_id), plain.hits.map((h) => h.chunk.chunk_id));
});

test("C1-6: mix still returns the best UAE/Dubai and global chunks together", () => {
  const r = hybridSearch(chunks, vectors, [0, 1, 0], "human oversight", { k: 2, mix: true });
  assert.deepEqual(r.hits.map((h) => h.chunk.jurisdiction).sort(), ["EU", "UAE-federal"]);
});

test("C1-6: a vector file that does not line up with the chunks is refused", () => {
  assert.ok(parseVectors(vectors, chunks));
  assert.equal(parseVectors({ ...vectors, ids: vectors.ids.slice(1), vectors: vectors.vectors.slice(1) }, chunks), null); // a chunk without a vector
  assert.equal(parseVectors({ ...vectors, dim: 4 }, chunks), null);
  assert.equal(parseVectors({ ...vectors, ids: [...vectors.ids, "ghost#0"], vectors: [...vectors.vectors, [0, 0, 0]] }, chunks), null);
  assert.equal(parseVectors(null, chunks), null);
  assert.deepEqual(vectorRanking(chunks, vectors, [0, 0, 1], 1).map((x) => x.id), ["nist#0"]);
});

test("C1-6: BM25 is the default; embedQuery returns null unless KB_VECTOR=on, and never throws", async () => {
  delete process.env.KB_VECTOR; // default: off, so BM25
  assert.equal(await embedQuery("anything"), null);
  process.env.KB_VECTOR = "off";
  assert.equal(await embedQuery("anything"), null);
  delete process.env.KB_VECTOR;
});

test("C1-6: the committed kb/vectors.json lines up with kb/chunks.json (every chunk, 768 dims)", async () => {
  const { readFileSync } = await import("node:fs");
  const chunks = JSON.parse(readFileSync("kb/chunks.json", "utf8")) as Chunk[];
  const v = parseVectors(JSON.parse(readFileSync("kb/vectors.json", "utf8")), chunks);
  assert.ok(v, "vectors.json does not match chunks.json: rebuild with python kb/build.py --embed");
  assert.equal(v!.dim, 768);
  assert.equal(v!.ids.length, chunks.length);
  assert.deepEqual(v!.ids, chunks.map((c) => c.chunk_id)); // same order as the build wrote them
});

test("C1-7: per-source cap, stemming and fusion weights behave as defined (all opt-in)", async () => {
  const { capPerSource, searchChunks, stemWord } = await import("../src/lib/un/kb.ts");
  const hit = (id: string) => ({ chunk: mk(id, "US", "x"), score: 1 });
  const capped = capPerSource([hit("a#0"), hit("a#1"), hit("a#2"), hit("b#0"), hit("c#0")], 3, 1);
  assert.deepEqual(capped.map((h) => h.chunk.chunk_id), ["a#0", "b#0", "c#0"]);
  assert.deepEqual(capPerSource([hit("a#0"), hit("a#1")], 2, 1).map((h) => h.chunk.chunk_id), ["a#0", "a#1"]); // backfills rather than returning short
  assert.deepEqual(["logged", "logging", "logs", "policies", "audit", "oversight"].map(stemWord), ["log", "log", "log", "policy", "audit", "oversight"]);
  const cs = [mk("l#0", "UAE-federal", "Every action the agent took was logged for audit."), mk("o#0", "US", "Unrelated passage about fruit.")];
  assert.equal(searchChunks(cs, "logging", { k: 1 }).length, 0); // plain: "logging" never meets "logged"
  assert.equal(searchChunks(cs, "logging", { k: 1, stem: true })[0].chunk.chunk_id, "l#0");
  const s = rrf([["a", "b"], ["b", "a"]], 60, [3, 1]);
  assert.ok(s.get("a")! > s.get("b")!); // the heavier ranking wins the tie
  assert.equal(searchChunks(cs, "audit", { k: 1 })[0].chunk.chunk_id, "l#0"); // defaults unchanged
});

test("C1-7: the held-out questions are valid and scored separately", async () => {
  const { evaluate } = await import("../scripts/eval_retrieval.ts");
  const r = evaluate({ set: "heldout" });
  assert.equal(r.n, 14);
  assert.ok(r.rows.find((x) => x.method === "bm25")!.recall5 >= 0.7);
});
