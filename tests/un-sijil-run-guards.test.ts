import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import test from "node:test";

const walk = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name)).map((d) => join(d.parentPath, d.name));
const SRC = walk("src");
const read = (f: string) => readFileSync(f, "utf8");

test("no file under src reads the node's admin token", () => {
  assert.deepEqual(SRC.filter((f) => read(f).includes("SIJIL_ADMIN_TOKEN")), []);
});

test("the agent key is read in one place only: sijil-agent-client.ts", () => {
  assert.deepEqual(SRC.filter((f) => read(f).includes("SIJIL_AGENT_KEY")).map((f) => basename(f)), ["sijil-agent-client.ts"]);
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

const page = (p: string) => read(`src/app/admin/federal/${p}`);

test("every screen that prints a Sijil rejected-call figure says whether it is a node or the simulated gate", () => {
  const screens = ["use-cases/[id]/pilot/page.tsx", "use-cases/[id]/evals/page.tsx", "use-cases/[id]/production/page.tsx", "use-cases/[id]/tuning/page.tsx", "evals/page.tsx", "_components/AgentRuntimePanel.tsx"];
  for (const s of screens) assert.match(page(s), /SealLine|simulated/i, `${s} does not say where its Sijil figures come from`);
  assert.match(page("use-cases/[id]/pilot/page.tsx"), /<SealLine /, "the pilot page must render the seal line");
});

test("SealLine names a node only for a sealed source, never calls a simulated or fallback source attested, and always says simulated for those", () => {
  const src = page("_components/SealLine.tsx");
  assert.match(src, /Simulated Sijil gate/);
  assert.match(src, /chain NOT verified/);
  assert.doesNotMatch(src, /attested/i);
});

test("SealLine says plainly, without the word NOT in capitals, when the node's strict verifier cannot check tool calls with no recorded model call", () => {
  const src = page("_components/SealLine.tsx");
  assert.match(src, /sl\.node\.orphan/);
  assert.match(src, /chain_orphan/);
});

test("the pilot route tells an operator when Sijil is configured but the agent settings are incomplete", () => {
  assert.match(read("src/app/api/admin/un/use-cases/[id]/pilot/route.ts"), /configProblem\(/);
});
