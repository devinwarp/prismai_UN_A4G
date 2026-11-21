import { loadSop } from "./sop-kb.ts";
import { commonTerms, keywords } from "./react-sop.ts";
import { pickConfig, RANGES, ROUTE_KINDS, validateConfig, type ReactConfig } from "./react-config.ts";
import { runQuestions, type Question, type QResult } from "./tuning-bank.ts";
import type { Retrieve } from "./react-sop.ts";

// Fix a miss with one click. For each miss on a TUNING question, try a small set of candidate edits
// (a setting one step either way, a glossary term removed or added, a routing term added), run the
// tuning questions again under each, and keep a candidate only if it fixes the miss and breaks no
// tuning question that was right. The proposer is SIMULATED: deterministic and rule-based, not a model.
// It reads tuning questions only; passing a held-out result or question is a programming error
// (the same guard as optimise() in tuning.ts). Pure apart from running the loop.

export type FixOp =
  | { op: "set"; key: keyof typeof RANGES; from: number; to: number }
  | { op: "glossary_remove"; term: string; entry: string }
  | { op: "glossary_add"; term: string; to: string }
  | { op: "route_add"; kind: string; term: string };

export interface FixProposal {
  id: string;
  change: FixOp;
  because: string[];
  /** tuning questions this edit makes correct */
  fixes: string[];
  candidate: ReactConfig;
}

export const describeFix = (c: FixOp): string =>
  c.op === "set" ? `Set ${c.key} from ${c.from} to ${c.to}` : c.op === "glossary_remove" ? `Stop rewriting “${c.term}” to “${c.entry}”` : c.op === "glossary_add" ? `Rewrite “${c.term}” to “${c.to}”` : `Route questions with “${c.term}” to ${c.kind} passages`;

const clone = (c: ReactConfig) => pickConfig(c);
const words = (t: string) => t.toLowerCase().match(/[a-z]{4,}/g) ?? [];
const bigrams = (w: string) => new Set(Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2)));
const dice = (a: string, b: string) => {
  const x = bigrams(a), y = bigrams(b);
  return (2 * [...x].filter((g) => y.has(g)).length) / (x.size + y.size);
};

function candidates(cfg: ReactConfig, q: QResult, sopId: string): { change: FixOp; candidate: ReactConfig }[] {
  const out: { change: FixOp; candidate: ReactConfig }[] = [];
  const add = (change: FixOp, edit: (c: ReactConfig) => void) => { const c = clone(cfg); edit(c); out.push({ change, candidate: c }); };
  for (const [key, r] of Object.entries(RANGES) as [keyof typeof RANGES, (typeof RANGES)[keyof typeof RANGES]][]) {
    for (const dir of [-1, 1]) {
      const to = Math.round((cfg[key] + dir * r.step) * 100) / 100;
      if (to >= r.min && to <= r.max) add({ op: "set", key, from: cfg[key], to }, (c) => { c[key] = to; });
    }
  }
  const lower = ` ${q.question.toLowerCase().replace(/[?.,]/g, " ")} `;
  for (const [gi, g] of cfg.glossary.entries()) {
    for (const t of g.from) if (lower.includes(` ${t} `) && g.from.length > 0) add({ op: "glossary_remove", term: t, entry: g.to }, (c) => { c.glossary[gi].from = c.glossary[gi].from.filter((x) => x !== t); if (!c.glossary[gi].from.length) c.glossary.splice(gi, 1); });
  }
  if (!("outside" in q.expect)) {
    const chunks = loadSop(sopId).chunks;
    const wanted = chunks.filter((c) => (q.expect as { chunks: string[] }).chunks.includes(c.chunk_id));
    const known = new Set(cfg.glossary.flatMap((g) => g.from));
    const common = commonTerms(chunks, cfg.commonShare);
    const body = (c: { text: string }) => c.text.split("\n").slice(1).join("\n");
    const have = new Set(wanted.flatMap((c) => words(body(c))));
    const asked = q.question.toLowerCase();
    // question words the expected passage does not use, mapped to a similarly spelt rarer word of it (a plausible variant, never an arbitrary word)
    const target = [...new Set(wanted.flatMap((c) => words(`${c.title} ${body(c)}`)))].filter((t) => !common.has(t) && !asked.includes(t));
    for (const w of keywords(q.question).split(" ").filter((x) => x.length >= 4 && !have.has(x) && !known.has(x))) {
      const best = target.map((t) => ({ t, s: dice(w, t) })).filter((x) => x.s >= 0.5).sort((x, y) => y.s - x.s).slice(0, 4);
      for (const { t } of best) add({ op: "glossary_add", term: w, to: t }, (c) => { c.glossary.push({ from: [w], to: t }); });
    }
    const routed = new Set(cfg.routes.flatMap((r) => r.terms));
    for (const kind of ROUTE_KINDS) {
      if (!wanted.some((c) => c.topics.includes(kind))) continue;
      for (const w of keywords(q.question).split(" ").filter((x) => x.length >= 4 && !routed.has(x))) {
        add({ op: "route_add", kind, term: w }, (c) => { const r = c.routes.find((x) => x.kind === kind); if (r) r.terms.push(w); else c.routes.push({ kind, terms: [w] }); });
      }
    }
  }
  return out.filter((c) => validateConfig(c.candidate).length === 0);
}

/** Candidate fixes for the misses among `results`, each verified on the tuning questions. */
export async function proposeFixes(a: { sopId: string; cfg: ReactConfig; questions: Question[]; results: QResult[]; retrieve: Retrieve; only?: string }): Promise<FixProposal[]> {
  if (a.results.some((r) => r.split !== "tune") || a.questions.some((x) => x.split !== "tune")) throw new Error("the fix proposer may read tuning questions only");
  const before = new Map(a.results.map((r) => [r.id, r.verdict]));
  const misses = a.results.filter((r) => r.verdict !== "correct" && (!a.only || r.id === a.only));
  const tried = new Map<string, { broke: boolean; fixed: string[] }>();
  const seen = new Map<string, FixProposal>();
  for (const miss of misses) {
    for (const c of candidates(a.cfg, miss, a.sopId)) {
      const key = JSON.stringify(c.change);
      let t = tried.get(key);
      if (!t) {
        const after = await runQuestions(a.sopId, c.candidate, a.questions, a.retrieve);
        t = { broke: after.some((r) => r.verdict !== "correct" && before.get(r.id) === "correct"), fixed: after.filter((r) => r.verdict === "correct" && before.get(r.id) !== "correct").map((r) => r.id) };
        tried.set(key, t);
      }
      if (t.broke || !t.fixed.includes(miss.id)) continue;
      const have = seen.get(key);
      if (have) have.because.push(miss.id);
      else seen.set(key, { id: `fix-${seen.size + 1}`, change: c.change, because: [miss.id], fixes: t.fixed, candidate: c.candidate });
    }
  }
  return [...seen.values()].sort((x, y) => y.fixes.length - x.fixes.length || (x.change.op === "set" ? 1 : 0) - (y.change.op === "set" ? 1 : 0));
}
