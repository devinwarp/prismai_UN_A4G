// Render the synthetic UC02 documents (fictitious) to PNG and record real Tesseract OCR output for
// each, keyed by image hash, so tests run offline.
//   node scripts/make_synthetic_docs.ts            render images only
//   node scripts/make_synthetic_docs.ts --ocr      also run live OCR and write ocr-cache.json
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { closeOcr, imageSha, tesseractOcr, type OcrResult } from "../src/lib/un/doc-ocr.ts";
import { DOC_DIR, DOCS } from "../src/lib/un/fixtures-uc02.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
mkdirSync(DOC_DIR, { recursive: true });
const cache: Record<string, OcrResult & { file: string }> = {};
for (const d of Object.values(DOCS)) {
  const h = 70 + d.lines.length * 52 + 30;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${h}"><rect width="100%" height="100%" fill="white"/>` +
    d.lines.map((l, i) => `<text x="40" y="${64 + i * 52}" font-family="Arial, Helvetica, sans-serif" font-size="${i === 0 ? 36 : 28}" font-weight="${i === 0 ? "bold" : "normal"}" fill="black">${esc(l)}</text>`).join("") + `</svg>`;
  let img = sharp(Buffer.from(svg)).png();
  if (d.blur) img = sharp(await img.toBuffer()).blur(d.blur).png();
  const buf = await img.toBuffer();
  writeFileSync(path.join(DOC_DIR, d.file), buf);
  if (process.argv.includes("--ocr")) {
    const r = await tesseractOcr(buf);
    cache[imageSha(buf)] = { text: r.text, confidence: r.confidence, file: d.file };
    console.log(d.file.padEnd(22), Math.round(r.confidence), JSON.stringify(r.text.split("\n").filter(Boolean).slice(0, 2)));
  }
}
if (process.argv.includes("--ocr")) {
  writeFileSync(path.join(DOC_DIR, "ocr-cache.json"), JSON.stringify(cache, null, 1));
  await closeOcr();
}
console.log(`${Object.keys(DOCS).length} documents in ${DOC_DIR}`);
