// Record the backup run: npm run export-replay (writes public/replay/backup-run.json).
import { mkdirSync, writeFileSync } from "node:fs";
import { BACKUP_PATH, buildReplays } from "../src/lib/un/replay.ts";

const kit = await buildReplays();
mkdirSync("public/replay", { recursive: true });
writeFileSync(BACKUP_PATH, JSON.stringify(kit, null, 2) + "\n");
console.log(`wrote ${BACKUP_PATH}: ${kit.runs.map((r) => `${r.scenario_id} ${r.steps.length} steps`).join(", ")}`);
