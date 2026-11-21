import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { AR, trN } from "../src/lib/un/i18n/dict.ts";

// There is no English dictionary: English lives at the call site (<T k en>, tr(lang, key, en)).
// So parity means: every literal key the screens use has an Arabic string, and an Arabic string
// keeps the {placeholders} of its English text. A new English string with a new key and no Arabic fails here.
const ROOTS = ["src/app/admin", "src/app/login", "src/app/replay", "src/components/landing"];
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : []; });
const files = ROOTS.flatMap((r) => { try { return walk(r); } catch { return []; } });

test("every literal translation key used by the screens has an Arabic string", () => {
  const keys = new Map<string, string>();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bk="([a-z][\w-]*\.[\w.-]+)"/g)) keys.set(m[1], f);
    for (const m of src.matchAll(/\btr\([^,()]+(?:\([^)]*\))?,\s*"([a-z][\w-]*\.[\w.-]+)"/g)) keys.set(m[1], f);
  }
  assert.ok(keys.size > 150, `found ${keys.size} keys`);
  const missing = [...keys].filter(([k]) => !AR[k]).map(([k, f]) => `${k} (${f})`);
  assert.deepEqual(missing, []);
});

test("an Arabic string keeps the {placeholders} of the English text it replaces", () => {
  const bad: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bk="([^"]+)"\s+en="([^"]*)"/g)) {
      const ar = AR[m[1]];
      if (!ar) continue;
      const want = [...m[2].matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join();
      const got = [...ar.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join();
      if (want !== got) bad.push(`${m[1]}: {${want}} vs {${got}}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("no Arabic string is empty or still English-only", () => {
  const bad = Object.entries(AR).filter(([, v]) => !/[؀-ۿ]/.test(v) && !/^[\d\s.,:%/()-]*$/.test(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});

test("counts: 1 gate added / 2 / 3-10 / 11+ in English and Arabic, never '1 gates'", () => {
  const en = (n: number) => trN("en", "gt.added", "{n} gates added", n, "1 gate added").replace("{n}", String(n));
  assert.equal(en(1), "1 gate added");
  assert.equal(en(2), "2 gates added");
  const ar = (n: number) => trN("ar", "gt.added", "{n} gates added", n).replace("{n}", String(n));
  assert.equal(ar(1), "أُضيفت بوابة واحدة");
  assert.equal(ar(2), "أُضيفت بوابتان");
  assert.equal(ar(3), "أُضيفت 3 بوابات");
  assert.equal(ar(11), "أُضيفت 11 بوابة");
  assert.equal(ar(0), "أُضيفت 0 بوابة");
});
