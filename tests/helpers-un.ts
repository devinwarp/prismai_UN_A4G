import { existsSync, readFileSync } from "node:fs";
import type { Chunk } from "../src/lib/un/kb.ts";

/** The built knowledge base when present, else a tiny stand-in so the suite
 * still runs on a fresh clone before `python kb/build.py`. */
export function loadChunksFrom(): Chunk[] {
  if (existsSync("kb/chunks.json")) return JSON.parse(readFileSync("kb/chunks.json", "utf8")) as Chunk[];
  return [{
    chunk_id: "stub#0", source_id: "stub", text: "Human oversight is required. Citizens must be informed.", sha256: "x", title: "stub",
    url: "u", issuer: "i", jurisdiction: "UAE-federal", instrument_type: "framework", binding: false, date: null, topics: [], matrix_quadrants: [],
  }];
}
