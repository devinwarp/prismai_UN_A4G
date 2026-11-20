// Extract the agent instructions (a skill file) for one job profile of a vectorised SOP.
//   node scripts/extract_skill.ts data/sops/uc02-trade-licence-renewal-sop.md "Document Verification Analyst"
// Refuses unless kb/sop/<id>/ holds vectors that match the SOP file as it is now.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chunkSop, extractSkill, loadSop, sopMetaFrom } from "../src/lib/un/sop-kb.ts";

const [file, profile] = process.argv.slice(2);
if (!file || !profile) { console.error('usage: node scripts/extract_skill.ts <sop.md> "<job profile>"'); process.exit(1); }
const md = readFileSync(file, "utf8");
const meta = sopMetaFrom(md, file.replaceAll("\\", "/"));
const now = chunkSop(md, meta);
const stored = loadSop(meta.sopId).chunks;
if (now.length !== stored.length || now.some((c, i) => c.chunk_sha256 !== stored[i].chunk_sha256)) {
  console.error(`${file} has changed since the knowledge base was built. Run: node scripts/build_sop_kb.ts ${file}`);
  process.exit(2);
}
const skill = extractSkill(meta.sopId, profile);
mkdirSync(path.dirname(skill.path), { recursive: true });
writeFileSync(skill.path, skill.markdown);
console.log(`${skill.path}: ${skill.chunkIds.length} SOP chunks, ${skill.markdown.length} chars`);
