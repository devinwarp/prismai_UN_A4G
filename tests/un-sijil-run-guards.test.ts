import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const walk = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name)).map((d) => join(d.parentPath, d.name));
const SRC = walk("src");
const read = (f: string) => readFileSync(f, "utf8");

test("no file under src reads the node's admin token", () => {
  assert.deepEqual(SRC.filter((f) => read(f).includes("SIJIL_ADMIN_TOKEN")), []);
});

test("the agent key is read in one place only: sijil-agent-client.ts", () => {
  assert.deepEqual(SRC.filter((f) => read(f).includes("SIJIL_AGENT_KEY")).map((f) => f.split("/").pop()), ["sijil-agent-client.ts"]);
});

test("the agent token and key are never read in a client component, and no client component imports the seal modules", () => {
  const client = SRC.filter((f) => /^\s*["']use client["']/m.test(read(f)));
  assert.deepEqual(client.filter((f) => /SIJIL_AGENT_|sijil-agent/.test(read(f))), []);
});

test("the README and .env.example document the live-run variables", () => {
  for (const f of ["README.md", ".env.example"]) {
    const t = read(f);
    for (const v of ["SIJIL_AGENT_ID", "SIJIL_AGENT_KEY", "SIJIL_AGENT_TOKEN"]) assert.ok(t.includes(v), `${f} lacks ${v}`);
  }
});

test("the README says plainly what sealing does and does not mean", () => {
  const t = read("README.md");
  assert.match(t, /sealed after each run/i);
  assert.match(t, /Prism's own gate (still )?decides/i);
  assert.match(t, /never added/i);
});
