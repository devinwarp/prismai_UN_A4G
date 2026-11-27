import { loadSop } from "../src/lib/un/sop-kb.ts";
import { commonTerms } from "../src/lib/un/react-sop.ts";
const chunks = loadSop("SOP-LIC-014").chunks;
const common = commonTerms(chunks, 0.2);
for (const id of ["Q5", "R6", "T04", "Q8", "S5"]) { const c = chunks.find((x) => x.chunk_id.endsWith("#" + id)); if (!c) continue; const w = [...new Set(c.text.toLowerCase().match(/[a-z]{7,}/g) ?? [])].filter((x) => !common.has(x)); console.log(id, c.title, "|", w.slice(0, 12).join(" ")); }
