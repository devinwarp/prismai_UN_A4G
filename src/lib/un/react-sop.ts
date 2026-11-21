import { bestSentence, type Chunk, type Hit } from "./kb.ts";
import { loadSop, searchSopForAgent, type SopChunk } from "./sop-kb.ts";
import { DEFAULT_REACT_CONFIG, termRegex, type GlossaryEntry, type ReactConfig, type RouteRule } from "./react-config.ts";

// ReAct (Thought, Action, Observation) over one SOP's knowledge base.
//
// The agent may do three things: search the SOP (and rewrite its query when the first
// search does not support an answer), request outside information, or finish. The loop
// guarantees one of two endings and never a third:
//   1. "answered": finish with at least one citation that the loop itself checked, i.e. a
//      retrieved chunk with a sentence sharing >= MIN_OVERLAP distinct terms with the
//      question it answers; or
//   2. "outside_kb": the required tool request_outside_information was called, because
//      nothing retrieved supports an answer. The agent must not answer from its own
//      knowledge. A finish with no valid citation, or a reasoner that runs out of steps,
//      is turned into this call by the loop.
// The default reasoner is rule-based (deterministic, no model): it searches, rewrites with
// an SOP glossary, splits compound questions, then gives up to the outside tool. An LLM
// reasoner can replace it through the same `Reasoner` interface; the guarantee above is
// enforced by the loop, not trusted to the reasoner.

// The thresholds, glossary and routing are data (react-config.ts); the defaults reproduce the
// constants that used to live here.
export const MIN_OVERLAP = DEFAULT_REACT_CONFIG.minOverlap;

export type Action =
  | { tool: "search_sop"; query: string; kind?: string }
  | { tool: "request_outside_information"; question: string; reason: string }
  | { tool: "finish"; citations: string[] };

export interface Step { thought: string; action: Action; observation: string }

export interface OutsideRequest { question: string; reason: string; tried: string[] }

export interface ReactState {
  question: string;
  steps: Step[];
  /** chunk id -> chunk, for everything retrieved so far */
  retrieved: Map<string, Chunk>;
  /** chunk id -> the query it supports */
  supported: Map<string, string>;
}

export type Reasoner = (s: ReactState) => { thought: string; action: Action } | Promise<{ thought: string; action: Action }>;
export type Retrieve = (query: string, kind?: string) => Promise<Hit[]> | Hit[];

export interface ReactResult {
  status: "answered" | "outside_kb";
  steps: Step[];
  citations: string[];
  /** Extractive: verbatim sentences from the cited chunks, never generated text. */
  answer: { chunk_id: string; quote: string }[];
  outside?: OutsideRequest;
  /** The cited chunks in full, so a caller can read a figure from the passage it cites. */
  evidence: Chunk[];
}

export function rewrite(question: string, glossary: GlossaryEntry[] = DEFAULT_REACT_CONFIG.glossary): string {
  let q = question.toLowerCase().replace(/[?.,]/g, " ");
  for (const g of glossary) q = q.replace(termRegex(g.from), g.to);
  return q.replace(/\s+/g, " ").trim();
}

function kindFor(q: string, routes: RouteRule[] = DEFAULT_REACT_CONFIG.routes): string | undefined {
  return routes.find((r) => r.terms.length && termRegex(r.terms, "").test(q))?.kind;
}

const words = (t: string) => t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];

/** Terms found in more than `share` of the SOP's chunks ("licence", "renew", "applicant"):
 * they say what the SOP is about, not what a passage answers, so they cannot count as support. */
export function commonTerms(chunks: { text: string }[], share = DEFAULT_REACT_CONFIG.commonShare): Set<string> {
  const df = new Map<string, number>();
  for (const c of chunks) for (const w of new Set(words(c.text))) df.set(w, (df.get(w) ?? 0) + 1);
  return new Set([...df].filter(([, n]) => n > share * chunks.length).map(([w]) => w));
}

/** Capitalised words in the question (not the first word) that appear nowhere in the SOP:
 * a place, person or body the SOP says nothing about, so it cannot answer for it. */
export function unknownNames(question: string, chunks: { text: string }[]): string[] {
  const vocab = new Set(chunks.flatMap((c) => words(c.text)));
  const rest = question.trim().split(/\s+/).slice(1).join(" ");
  return [...new Set(rest.match(/\b[A-Z][a-z]{3,}\b/g) ?? [])].filter((w) => !vocab.has(w.toLowerCase()));
}

const FILLER = new Set("what which who whom whose when where why how does did can could would should will shall are was were the and for with from that this have has not but any about into than then there these those such been being also other more most some each both over under need needs want must may you your our their they them its".split(" "));
/** The question reduced to its content words. */
export const keywords = (q: string) => words(q).filter((w) => !FILLER.has(w)).join(" ");

/** Hits that support an answer to `query`: (1) a sentence shares enough distinct content terms with
 * it (about 40% of them, at least 2, at most 4; at least 2 once the search was narrowed to a kind
 * of passage), (2) at least one of those terms is rare in this SOP, so the match is not just
 * "licence" and "renewal", and (3) the chunk is not the document-control table unless the
 * question is about the document itself. */
export function groundedHits(hits: Hit[], query: string, common: Set<string> = new Set(), narrowed = false, cfg: Pick<ReactConfig, "minOverlap" | "overlapShare" | "maxNeed"> = DEFAULT_REACT_CONFIG): { hit: Hit; overlap: number }[] {
  const terms = [...new Set(words(query).filter((w) => !FILLER.has(w)))];
  const rare = terms.filter((w) => !common.has(w));
  const need = narrowed ? cfg.minOverlap : Math.min(cfg.maxNeed, Math.max(cfg.minOverlap, Math.ceil(terms.length * cfg.overlapShare)));
  const aboutDoc = /\b(version|document id|review cycle|who owns (the|this) (sop|document|procedure)|document owner)\b/.test(query.toLowerCase());
  return hits
    .filter((h) => aboutDoc || !h.chunk.topics.includes("overview"))
    .map((hit) => {
      const body = hit.chunk.text.split("\n").slice(1).join("\n");
      return { hit, overlap: bestSentence(body, terms.join(" ")).overlap, rareOverlap: rare.length ? bestSentence(body, rare.join(" ")).overlap : 1 };
    })
    .filter((x) => x.overlap >= need && x.rareOverlap >= 1)
    .map(({ hit, overlap }) => ({ hit, overlap }))
    .sort((a, b) => b.overlap - a.overlap);
}

const searchedQueries = (s: ReactState) => s.steps.flatMap((x) => (x.action.tool === "search_sop" ? [x.action.query] : []));

/** Search, rewrite with the glossary, split a compound question, then ask for outside information. */
export const makeRuleReasoner = (cfg: ReactConfig = DEFAULT_REACT_CONFIG): Reasoner => (s) => {
  const tried = searchedQueries(s);
  const last = s.steps[s.steps.length - 1];
  if (last?.action.tool === "search_sop" && s.supported.size) {
    return { thought: "The search returned passages that support an answer. I will cite them.", action: { tool: "finish", citations: [...s.supported.keys()].slice(0, 3) } };
  }
  if (!tried.length) return { thought: "Search the SOP for the question as asked.", action: { tool: "search_sop", query: s.question } };
  const rw = rewrite(s.question, cfg.glossary);
  if (!tried.includes(rw)) {
    return { thought: "The first search did not support an answer. The question may use different words from the SOP, so rewrite it with SOP terms and narrow to the likely kind of passage.", action: { tool: "search_sop", query: rw, kind: kindFor(rw, cfg.routes) } };
  }
  const kw = keywords(s.question);
  if (kw && !tried.includes(kw)) {
    return { thought: "Still nothing. Search on the content words alone, without the question wording.", action: { tool: "search_sop", query: kw } };
  }
  const parts = rw.split(/\s+(?:and|or)\s+|;/).map((p) => p.trim()).filter((p) => p.split(" ").length >= 2);
  const next = parts.find((p) => !tried.includes(p));
  if (parts.length > 1 && next) {
    return { thought: "Still nothing. The question may be several questions, so try one part at a time.", action: { tool: "search_sop", query: next } };
  }
  return {
    thought: "Three differently worded searches found nothing in the SOP that supports an answer. This is outside the knowledge base, so I must not answer from memory; I will request the information from outside.",
    action: { tool: "request_outside_information", question: s.question, reason: "No passage in the SOP knowledge base supports an answer." },
  };
};

export const ruleReasoner: Reasoner = makeRuleReasoner();

export interface ReactOptions {
  /** glossary, routing and thresholds; defaults to DEFAULT_REACT_CONFIG */
  config?: ReactConfig;
  retrieve?: Retrieve;
  reasoner?: Reasoner;
  maxSteps?: number;
  /** The required tool. Called at most once per run; its return value is recorded in the trace. */
  requestOutside?: (r: OutsideRequest) => Promise<string> | string;
}

export async function reactAnswer(sopId: string, question: string, opts: ReactOptions = {}): Promise<ReactResult> {
  const retrieve: Retrieve = opts.retrieve ?? (async (q, kind) => (await searchSopForAgent(sopId, q, { k: 5, kind })).hits);
  const cfg = opts.config ?? DEFAULT_REACT_CONFIG;
  const reason = opts.reasoner ?? makeRuleReasoner(cfg);
  const max = opts.maxSteps ?? cfg.maxSteps;
  const sop = loadSop(sopId).chunks;
  const common = commonTerms(sop, cfg.commonShare);
  const names = unknownNames(question, sop);
  const s: ReactState = { question, steps: [], retrieved: new Map(), supported: new Map() };
  const outside = async (thought: string, why: string): Promise<ReactResult> => {
    const req: OutsideRequest = { question, reason: why, tried: searchedQueries(s) };
    const obs = opts.requestOutside ? await opts.requestOutside(req) : "recorded; no outside source is connected, so a person must answer";
    s.steps.push({ thought, action: { tool: "request_outside_information", question, reason: why }, observation: obs });
    return { status: "outside_kb", steps: s.steps, citations: [], answer: [], outside: req, evidence: [] };
  };

  for (let i = 0; i < max; i++) {
    const { thought, action } = await reason(s);
    if (action.tool === "search_sop") {
      const hits = await retrieve(action.query, action.kind);
      for (const h of hits) s.retrieved.set(h.chunk.chunk_id, h.chunk);
      const g = groundedHits(hits, action.query, common, !!action.kind, cfg);
      for (const x of g) if (!s.supported.has(x.hit.chunk.chunk_id)) s.supported.set(x.hit.chunk.chunk_id, action.query);
      s.steps.push({
        thought, action,
        observation: `${hits.map((h) => h.chunk.chunk_id.split("#")[1]).join(", ") || "no hits"}; supporting: ${g.map((x) => x.hit.chunk.chunk_id.split("#")[1]).join(", ") || "none"}`,
      });
    } else if (action.tool === "request_outside_information") {
      return outside(thought, action.reason);
    } else {
      const valid = names.length ? [] : action.citations.filter((c) => s.supported.has(c));
      if (!valid.length) {
        s.steps.push({ thought, action, observation: names.length ? `rejected: the question names ${names.join(", ")}, which the SOP never mentions` : "rejected: no cited chunk was retrieved and shown to support the question" });
        return outside("A finish without a supported citation is not allowed, so the answer cannot come from the knowledge base.", "The answer had no supporting passage in the SOP knowledge base.");
      }
      s.steps.push({ thought, action, observation: `accepted: ${valid.join(", ")}` });
      return {
        status: "answered", steps: s.steps, citations: valid, evidence: valid.map((id) => s.retrieved.get(id)!),
        answer: valid.map((id) => ({ chunk_id: id, quote: bestSentence(s.retrieved.get(id)!.text.split("\n").slice(1).join("\n"), words(s.supported.get(id)!).filter((w) => !FILLER.has(w)).join(" "), 300).sentence })),
      };
    }
  }
  return outside("The step limit was reached without a supported answer.", "No supported answer within the step limit.");
}

export type { SopChunk };
