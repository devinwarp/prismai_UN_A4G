// Run the per-task evals of SOP-LIC-014 against the real skill, ReAct retrieval, OCR and case memory.
//   node scripts/run_task_evals.ts                 recorded OCR output, BM25 retrieval (offline)
//   node scripts/run_task_evals.ts --live-ocr      run Tesseract on the images (needs network once)
//   KB_VECTOR=on node scripts/run_task_evals.ts --vector   require vector retrieval, as an automated agent does
import { closeOcr, tesseractOcr } from "../src/lib/un/doc-ocr.ts";
import { searchSop, searchSopForAgent } from "../src/lib/un/sop-kb.ts";
import { perTask, recordedOcr, runAll, SOP_ID } from "../src/lib/un/task-evals.ts";

const vector = process.argv.includes("--vector");
const live = process.argv.includes("--live-ocr");
const retrieve = vector
  ? async (q: string, kind?: string) => (await searchSopForAgent(SOP_ID, q, { k: 5, kind })).hits
  : async (q: string, kind?: string) => (await searchSop(SOP_ID, q, { k: 5, kind })).hits;
const outcomes = await runAll({ retrieve, ocr: live ? tesseractOcr : recordedOcr() });
if (live) await closeOcr();
for (const t of perTask(outcomes)) console.log(`${t.task.padEnd(5)} ${t.correct}/${t.total}`);
for (const o of outcomes.filter((x) => x.verdict !== "correct")) console.log(`  ${o.verdict.toUpperCase()} ${o.id}: ${o.failures.join("; ")}`);
const ok = outcomes.filter((o) => o.verdict === "correct").length;
console.log(`${ok}/${outcomes.length} correct (${vector ? "vector" : "BM25"} retrieval, ${live ? "live" : "recorded"} OCR)`);
process.exit(ok === outcomes.length ? 0 : 1);
