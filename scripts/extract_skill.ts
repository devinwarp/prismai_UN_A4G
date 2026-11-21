// Extract the agent instructions (a skill file) for one job profile of a vectorised SOP.
//   node scripts/extract_skill.ts data/sops/uc02-trade-licence-renewal-sop.md "Document Verification Analyst"
// Refuses unless kb/sop/<id>/ holds vectors that match the SOP file as it is now.
import { readFileSync } from "node:fs";
import { sopMetaFrom } from "../src/lib/un/sop-kb.ts";
import { checkSopKb, writeSkill } from "../src/lib/un/skill-extract.ts";

const [file, profile] = process.argv.slice(2);
if (!file || !profile) { console.error('usage: node scripts/extract_skill.ts <sop.md> "<job profile>"'); process.exit(1); }
const sopId = sopMetaFrom(readFileSync(file, "utf8"), file.replaceAll("\\", "/")).sopId;
const kb = checkSopKb(sopId);
if (!kb.ok) { console.error(`${file}: ${kb.reason}`); process.exit(2); }
const r = writeSkill(sopId, profile);
if (!r.ok) { console.error(r.reason); process.exit(1); }
console.log(`${r.path} (${r.sha256.slice(0, 12)})`);
