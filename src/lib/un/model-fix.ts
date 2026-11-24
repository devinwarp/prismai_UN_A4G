import { parseLlmJson } from "../llm.ts";
import { pickConfig, ROUTE_KINDS, validateConfig, type ReactConfig } from "./react-config.ts";
import { loadSop } from "./sop-kb.ts";
import type { QResult } from "./tuning-bank.ts";
import type { FixOp } from "./tuning-fix.ts";

// The model's part of the tuning agent: for a question the agent got wrong, it proposes small edits to the retrieval settings (a glossary
// term, a retrieval route). It only PROPOSES. Code then checks each edit three ways before anything can be applied: the edit is one of the
// allowed kinds and valid under the settings' own rules; it uses only words the SOP itself uses; and, run on the tuning questions, it fixes
// the miss and breaks nothing (autotune-service.ts). The model never edits the agent itself, and it is never shown a held-out question.

export type ChatFn = (o: { system: string; user: string }) => Promise<string>;

export const MODEL_FIX_SYSTEM = `You tune the retrieval settings of an agent that answers questions about ONE standard operating procedure (SOP). You are shown ONE question the agent got wrong, what the right answer is (the passage ids with their text, or that the SOP does not answer it) and the agent's current glossary and routes.
Propose up to 3 small edits that would make the agent get THIS question right without making anything else worse. Each edit is exactly one of:
{"op":"glossary_add","term":"<a word of the question, lower case>","to":"<the word the SOP itself uses for it>"}
{"op":"glossary_remove","term":"<a word the glossary rewrites that hurts here>"}
{"op":"route_add","kind":"required-documents|fees|decision-rule","term":"<a word of the question>"}
Rules: use words exactly as they appear in the question and in the passages; never use a word the SOP does not use; when the SOP does not answer the question, the right fix is NOT to make the agent find an answer: propose a glossary_remove or nothing. Reply with one JSON object only: {"edits":[...]}`;

const TERM = /^[a-z][a-z -]{1,39}$/;
const words = (t: string) => t.toLowerCase().match(/[a-z]{3,}/g) ?? [];

export function buildFixPrompt(miss: QResult, cfg: ReactConfig, sopId: string): { system: string; user: string } {
  const chunks = loadSop(sopId).chunks;
  const wanted = "outside" in miss.expect ? [] : chunks.filter((c) => (miss.expect as { chunks: string[] }).chunks.includes(c.chunk_id));
  const right = "outside" in miss.expect
    ? "The SOP does NOT answer this question; the agent should have gone outside, and it answered."
    : `The right answer is in: ${wanted.map((c) => `[${c.chunk_id}] ${c.text.split("\n").slice(1).join(" ").slice(0, 500)}`).join(" || ")}`;
  const did = miss.status === "outside_kb" ? "The agent went outside and did not answer." : `The agent answered from ${miss.citations.join(", ") || "nothing"}.`;
  const gloss = cfg.glossary.map((g) => `${g.from.join("/")} -> ${g.to}`).join("; ");
  const routes = cfg.routes.map((r) => `${r.kind}: ${r.terms.join(", ")}`).join("; ");
  return { system: MODEL_FIX_SYSTEM, user: `Question: ${miss.question}\n${did}\nWhy it is wrong: ${miss.verdict}.\n${right}\n\nCurrent glossary: ${gloss}\nCurrent routes: ${routes}` };
}

/** The SOP's own vocabulary, so an edit can be checked to use only words the SOP uses. */
const vocabOf = (sopId: string) => new Set(loadSop(sopId).chunks.flatMap((c) => words(`${c.title} ${c.text}`)));

/** The edits in a model reply that are well-formed: a known kind, terms that are plain lower-case words, and (for a glossary target) only
 * words the SOP uses. Anything else is dropped without comment: the model's output is never trusted, only checked. */
export function parseModelEdits(reply: string, cfg: ReactConfig, sopId: string): FixOp[] {
  let o: { edits?: unknown };
  try { o = parseLlmJson(reply) as typeof o; } catch { return []; }
  if (!o || !Array.isArray(o.edits)) return [];
  const vocab = vocabOf(sopId);
  const out: FixOp[] = [];
  // the first three VALID edits out of at most ten the model wrote: a bad one does not use up a slot
  for (const e of o.edits.slice(0, 10) as Record<string, unknown>[]) {
    if (out.length >= 3) break;
    if (!e || typeof e !== "object") continue;
    const term = typeof e.term === "string" ? e.term.trim().toLowerCase() : "";
    if (!TERM.test(term)) continue;
    if (e.op === "glossary_add") {
      const to = typeof e.to === "string" ? e.to.trim().toLowerCase() : "";
      if (!TERM.test(to) || !words(to).every((w) => vocab.has(w)) || cfg.glossary.some((g) => g.from.includes(term))) continue;
      out.push({ op: "glossary_add", term, to });
    } else if (e.op === "glossary_remove") {
      const entry = cfg.glossary.find((g) => g.from.includes(term));
      if (entry) out.push({ op: "glossary_remove", term, entry: entry.to });
    } else if (e.op === "route_add") {
      const kind = typeof e.kind === "string" ? e.kind : "";
      if ((ROUTE_KINDS as readonly string[]).includes(kind) && !cfg.routes.some((r) => r.terms.includes(term))) out.push({ op: "route_add", kind, term });
    }
  }
  return out;
}

/** The settings with one edit applied, or null when the result would not be valid under the settings' own rules. */
export function applyFixOp(cfg: ReactConfig, op: FixOp): ReactConfig | null {
  const c = pickConfig(cfg);
  if (op.op === "glossary_add") c.glossary.push({ from: [op.term], to: op.to });
  else if (op.op === "glossary_remove") {
    const g = c.glossary.find((x) => x.from.includes(op.term));
    if (!g) return null;
    g.from = g.from.filter((t) => t !== op.term);
    if (!g.from.length) c.glossary = c.glossary.filter((x) => x !== g);
  } else if (op.op === "route_add") {
    const r = c.routes.find((x) => x.kind === op.kind);
    if (r) r.terms.push(op.term); else c.routes.push({ kind: op.kind as never, terms: [op.term] });
  } else return null;
  return validateConfig(c).length === 0 ? c : null;
}

/** The model's candidate edits for one miss, each applied to the settings; invalid ones are dropped. */
export async function modelCandidates(chat: ChatFn, a: { cfg: ReactConfig; miss: QResult; sopId: string }): Promise<{ change: FixOp; candidate: ReactConfig }[]> {
  const p = buildFixPrompt(a.miss, a.cfg, a.sopId);
  const edits = parseModelEdits(await chat(p), a.cfg, a.sopId);
  return edits.flatMap((change) => { const candidate = applyFixOp(a.cfg, change); return candidate ? [{ change, candidate }] : []; });
}
