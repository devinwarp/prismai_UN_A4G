import { readFileSync } from "node:fs";
import path from "node:path";

// kb/gaps.json is the single source of truth for the gap page and the report.
export const GAP_CATEGORIES = [
  "unclear_responsibilities", "standards", "technology", "legislative", "coordination", "conflicting_objectives",
] as const;
export type GapCategory = (typeof GAP_CATEGORIES)[number];

export interface Gap {
  id: string;
  category: GapCategory;
  statement: string;
  national: { chunk_id: string; note: string }[];
  global: { source_id: string; chunk_ids: string[]; support: "primary" | "secondary-summary"; note: string }[];
  not_ingested: { name: string; note: string }[];
  prism: { response: string; refs: { kind: string; label: string; path: string }[] };
  caveat: string;
}
export interface GapsFile { title: string; scope: string; categories: Record<GapCategory, string>; gaps: Gap[] }

export const loadGaps = (): GapsFile =>
  JSON.parse(readFileSync(path.join(process.cwd(), "kb", "gaps.json"), "utf8")) as GapsFile;

/** Problems found, empty when every chunk id and source id resolves. */
export function validateGaps(f: GapsFile, chunkIds: Set<string>, sourceIds: Set<string>): string[] {
  const bad: string[] = [];
  for (const g of f.gaps) {
    if (!(GAP_CATEGORIES as readonly string[]).includes(g.category)) bad.push(`${g.id}: category ${g.category}`);
    for (const n of g.national) if (!chunkIds.has(n.chunk_id)) bad.push(`${g.id}: national chunk ${n.chunk_id}`);
    for (const x of g.global) {
      if (!sourceIds.has(x.source_id)) bad.push(`${g.id}: global source ${x.source_id}`);
      if (!x.chunk_ids.length) bad.push(`${g.id}: global ${x.source_id} has no chunk`);
      for (const c of x.chunk_ids) {
        if (!chunkIds.has(c)) bad.push(`${g.id}: global chunk ${c}`);
        else if (c.split("#")[0] !== x.source_id) bad.push(`${g.id}: chunk ${c} not in ${x.source_id}`);
      }
    }
  }
  return bad;
}
