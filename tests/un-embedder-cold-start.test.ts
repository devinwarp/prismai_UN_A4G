import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { embedderLoading, EmbedderLoadingError } from "../src/lib/un/vector.ts";

// A hosted instance starts cold: the embedding model is downloaded and loaded on its first use, which takes longer than a step may wait. That must read as "try again
// shortly", never as a failed run: the first cold case used to turn into a terminal job error that stopped the whole run and its server loop.

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("a model that is still loading is its own error, told apart from one that failed to load", () => {
  const e = new EmbedderLoadingError();
  assert.ok(e instanceof Error);
  assert.equal(e.name, "EmbedderLoadingError");
  assert.match(e.message, /still loading/);
  assert.match(e.message, /Try again/);
  assert.equal(embedderLoading(), false, "nothing is loading until a caller asks for the model");
});

test("retrieval for an automated agent throws the loading error while the model loads, and keeps the hard error for a model that failed (never keyword search)", () => {
  const kb = read("src/lib/un/sop-kb.ts");
  assert.match(kb, /embedderLoading\(\) \? new EmbedderLoadingError\(\)/);
  assert.match(kb, /the embedding model did not load\. Nothing was answered from keyword search/);
});

test("the pilot waits a bounded time for the model before a batch, answers busy while it loads, and warms it up at the start of a run", () => {
  const route = read("src/app/api/admin/un/use-cases/[id]/pilot/sop/route.ts");
  assert.match(route, /ensureEmbedder\(EMBEDDER_WAIT_MS\)\) === "loading"\) return \{ job, busy: true, warming: true \}/, "before a retrieving batch");
  assert.match(route, /warming = error instanceof EmbedderLoadingError/, "a loading error mid-batch is not a job error");
  assert.match(route, /warmEmbedder\(\);/, "the model starts loading when a run starts");
  assert.match(route, /EMBEDDER_WAIT_MS = 25_000/);
  const wait = Number(/EMBEDDER_WAIT_MS = ([\d_]+)/.exec(route)![1].replaceAll("_", ""));
  const max = Number(/export const maxDuration = (\d+)/.exec(route)![1]) * 1000;
  assert.ok(wait < max / 2, "the wait leaves most of the step's time for the batch");
});

test("a loading model leaves the job running and the lease released, so the server loop and the page ask again", () => {
  const route = read("src/app/api/admin/un/use-cases/[id]/pilot/sop/route.ts");
  assert.match(route, /next = warming \? job : \{ \.\.\.job, status: "error"/);
  assert.match(route, /if \(await save\(locked, next\)\) return warming \? \{ job: next, busy: true, warming: true \}/);
  assert.match(route, /if \(r\.busy\) await sleep\(2000\)/, "the server loop already retries on busy");
});
