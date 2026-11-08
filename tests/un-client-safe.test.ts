import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// A client component must not pull node:fs (or path, os, ...) into the browser bundle
// (the production build fails). Found the hard way: C2-2 imported agents.ts.
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const value = /^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm;

function nodeImports(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(value)) {
    const spec = m[1];
    // node:crypto bundles for the browser (sijil.ts already relies on it); fs, path, os and the rest do not
    if (spec.startsWith("node:")) { if (spec !== "node:crypto") out.push(`${file} -> ${spec}`); }
    else if (spec.startsWith("@/lib/un/") || spec.startsWith("./") || spec.startsWith("../")) {
      const base = spec.startsWith("@/") ? join("src", spec.slice(2)) : join(file, "..", spec);
      const target = [".ts", ".tsx", ""].map((e) => base.replace(/\.ts$/, "") + e).find((p) => { try { return statSync(p).isFile(); } catch { return false; } });
      if (target) out.push(...nodeImports(target, seen));
    }
  }
  return out;
}

test("client components in the federal area import nothing that reaches node:*", () => {
  const clients = walk("src/app/admin/federal").filter((f) => /\.tsx$/.test(f) && /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
  assert.ok(clients.length >= 4);
  const bad = clients.flatMap((f) => nodeImports(f));
  assert.deepEqual(bad, []);
});
