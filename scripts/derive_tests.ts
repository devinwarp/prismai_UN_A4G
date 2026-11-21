// Derive the required pilot tests for one job profile of a vectorised SOP, and compare them with the executable
// per-task evals that exist today.
//   node scripts/derive_tests.ts "Document Verification Analyst"
//   node scripts/derive_tests.ts "Fee and Payment Officer" --json     the blueprints as JSON
//   node scripts/derive_tests.ts <profile> --sop SOP-LIC-014
// The blueprints are specifications for a process owner to review (see src/lib/un/test-derive.ts); the executable
// cases in src/lib/un/task-evals.ts were written by hand and are not yet linked to them, so the comparison is by count.
import { CASES } from "../src/lib/un/task-evals.ts";
import { loadSop } from "../src/lib/un/sop-kb.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { deriveTests, FAMILIES, summary } from "../src/lib/un/test-derive.ts";

const args = process.argv.slice(2);
const sopAt = args.indexOf("--sop");
const sopId = sopAt >= 0 ? args[sopAt + 1] : "SOP-LIC-014";
const profile = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--sop");
if (!profile) { console.error('usage: node scripts/derive_tests.ts "<job profile>" [--sop <id>] [--json]'); process.exit(1); }

const profiles = profilesOf(sopId);
if (!profiles) { console.error(`${sopId} is not a registered SOP`); process.exit(1); }
const flags = Object.fromEntries(profiles.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }])));
const blueprints = deriveTests({ sopId, profile, chunks: loadSop(sopId).chunks, flags });
if (args.includes("--json")) { console.log(JSON.stringify(blueprints, null, 1)); process.exit(0); }

const s = summary(blueprints);
console.log(`${profile} (${sopId}): ${blueprints.length} required tests\n`);
console.log("task".padEnd(10) + FAMILIES.map((f) => f.slice(0, 9).padEnd(10)).join("") + "| existing eval cases");
for (const [task, fam] of Object.entries(s)) {
  const have = CASES.filter((c) => c.task === task).length;
  const specific = (fam.happy_path ?? 0) + (fam.exception ?? 0) + (fam.boundary ?? 0) + (fam.client_facing ?? 0);
  // only a task of this profile has task-specific tests; the other rows are refusal tests, which the existing cases do not label
  const shown = specific ? `${have}${have < specific ? `  (fewer than the ${specific} task-specific tests required)` : ""}` : "-";
  console.log(task.padEnd(10) + FAMILIES.map((f) => String(fam[f] ?? "").padEnd(10)).join("") + `| ${shown}`);
}
const cf = [...new Set(blueprints.filter((b) => b.family === "client_facing").map((b) => b.task))];
console.log(`\nclient-facing tasks: ${cf.join(", ") || "none"}`);
for (const t of cf) console.log(`  ${t}: ${blueprints.filter((b) => b.task === t && b.family === "client_facing").map((b) => b.scenario).join(", ")}`);
