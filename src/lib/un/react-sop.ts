import { SijilBlockedError } from "../llm.ts";
import { bestSentence, type Chunk, type Hit } from "./kb.ts";
import { loadSop, searchSopForAgent, type SopChunk } from "./sop-kb.ts";
import { DEFAULT_REACT_CONFIG, termRegex, type GlossaryEntry, type ReactConfig, type RouteKind, type RouteRule } from "./react-config.ts";
import { simulatedGate, type CallDecision } from "./sijil-calls.ts";

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
  /** Set when the question asks for ALL items of a kind ("which documents are required"): the ids of every passage of that kind,
   * which the loop gathered itself because the SOP keeps one passage per item and a search returns only the top few. */
  enumerated?: string[];
}

/** A reflection: after the reasoner proposes to finish, a second look at ONLY the question and the cited passages. It must say
 * whether a passage states the answer to THIS question (its place, amount, person or condition included) and quote the
 * sentence that does. The loop checks the quote itself: it must exist word for word in a cited passage. */
export interface Reflection { answers: boolean; quote: string; why: string }
export type Reflector = (question: string, passages: { chunk_id: string; text: string }[], opts?: { list?: boolean }) => Promise<Reflection>;

const squash = (t: string) => t.toLowerCase().replace(/[*_`>#|-]+/g, " ").replace(/\s+/g, " ").trim();

/** Does the reflection stand? It must claim an answer, and its quote must be real text of a cited passage (not a paraphrase
 * and not a made-up one): the model cannot pass this step by saying yes. A passage may be a table, so the quote may be a row
 * or cells; it may skip text with "..." or join a table header and a cell with "|", as long as every fragment is word for word in ONE passage,
 * in order, and at least one fragment is substantial. */
export function verifyReflection(r: Reflection | null, passages: { chunk_id: string; text: string }[]): { ok: true; chunk_id: string; quote: string } | { ok: false; why: string } {
  if (!r || r.answers !== true) return { ok: false, why: r?.why?.slice(0, 200) || "no cited passage states the answer to this question" };
  // fragments are separated by "..." or by "|" (a table cell boundary: a header and a cell of its column are two fragments)
  const parts = String(r.quote ?? "").split(/\.{3}|\u2026|\|/).map(squash).filter((x) => x.length > 0);
  // at least one fragment must be substantial: two stray words ("licence | renew") are not a quote of what states the answer
  const longest = parts.reduce((a, b) => (b.length > a.length ? b : a), "");
  if (longest.length < 8 || longest.split(" ").filter(Boolean).length < 2) return { ok: false, why: "the reflection gave no quote that states the answer" };
  const inOrder = (text: string) => { let at = 0; for (const part of parts) { const i = text.indexOf(part, at); if (i < 0) return false; at = i + part.length; } return true; };
  const hit = passages.find((p) => inOrder(squash(p.text)));
  return hit ? { ok: true, chunk_id: hit.chunk_id, quote: String(r.quote).trim().slice(0, 400) } : { ok: false, why: "the quote is not text of any cited passage" };
}

export type Reasoner = (s: ReactState) => { thought: string; action: Action } | Promise<{ thought: string; action: Action }>;
export type Retrieve = (query: string, kind?: string) => Promise<Hit[]> | Hit[];

export interface ReactResult {
  status: "answered" | "outside_kb" | "answered_by_person";
  steps: Step[];
  citations: string[];
  /** Extractive: verbatim sentences from the cited chunks, never generated text. */
  answer: { chunk_id: string; quote: string }[];
  outside?: OutsideRequest;
  /** set when a person answered this earlier and the agent resumed from case memory */
  person_answer?: { answer: string; role: string; at: string; request_id: string | null };
  /** The cited chunks in full, so a caller can read a figure from the passage it cites. */
  evidence: Chunk[];
  /** Every tool call the reasoner attempted, each decided by the (simulated) Sijil gate. */
  calls: CallDecision[];
}

/** The only tools the loop will run. Anything else a reasoner names is rejected, not executed. */
export const REACT_TOOLS = ["search_sop", "request_outside_information", "finish"];

/** A question that asks for a named individual. The SOP names roles, never people, so no passage
 * can answer it; shared words with the role description must not count as support. */
export function asksForPerson(question: string): boolean {
  const q = question.toLowerCase();
  return /\bby name\b|\b(his|her|their) (full )?name\b|\bwhich (person|individual)\b/.test(q)
    || /\b(name|names) of (the |our |my )?(head|supervisor|officer|analyst|manager|director|owner|licensing|compliance|finance)\b/.test(q)
    || /\bwho (is|are|was) (the |our |my )?(current )?(head|supervisor|officer|analyst|manager|director|licensing|compliance|finance)\b/.test(q);
}

/** Validate what a reasoner returned. A malformed or unknown action is rejected with a reason. */
export function checkAction(a: unknown, kinds: Set<string>): { ok: true; action: Action } | { ok: false; tool: string; why: string } {
  const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const tool = typeof o.tool === "string" ? o.tool.slice(0, 60) : "(none)";
  if (!REACT_TOOLS.includes(tool)) return { ok: false, tool, why: `${tool} is not one of the tools this agent has (${REACT_TOOLS.join(", ")})` };
  if (tool === "search_sop") {
    if (typeof o.query !== "string" || !o.query.trim()) return { ok: false, tool, why: "search_sop needs a non-empty query" };
    if (o.kind != null && (typeof o.kind !== "string" || !kinds.has(o.kind))) return { ok: false, tool, why: `unknown passage kind ${JSON.stringify(o.kind)}` };
    return { ok: true, action: { tool, query: o.query.slice(0, 300), ...(o.kind ? { kind: o.kind as string } : {}) } };
  }
  if (tool === "request_outside_information") return { ok: true, action: { tool, question: String(o.question ?? ""), reason: String(o.reason ?? "").slice(0, 300) } };
  const cites = Array.isArray(o.citations) ? o.citations.filter((c): c is string => typeof c === "string") : [];
  return { ok: true, action: { tool: "finish", citations: cites } };
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
 * of passage), (2) at least one of the shared terms is rare in this SOP, so the match is not just
 * "licence" and "renewal" (the same sentence must meet (1) and (2)), and (3) the chunk is not the document-control table unless the
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
      // both conditions must hold in the SAME sentence: a sentence that shares enough of the question's words and, among them, at
      // least one rare word. (Judged on the passage as a whole, the common words of one sentence ("documents", "required") could be
      // paired with a rare word of another ("open the case"), and a passage would "support" a question it does not answer.)
      let overlap = 0;
      let rareOverlap = rare.length ? 0 : 1;
      for (const sentence of body.split(/(?<=[.!?])\s+/).filter(Boolean)) {
        const o = bestSentence(sentence, terms.join(" ")).overlap;
        const r = rare.length ? bestSentence(sentence, rare.join(" ")).overlap : 1;
        if (r >= 1 && o > overlap) { overlap = o; rareOverlap = r; }
      }
      return { hit, overlap, rareOverlap };
    })
    .filter((x) => x.overlap >= need && x.rareOverlap >= 1)
    .map(({ hit, overlap }) => ({ hit, overlap }))
    .sort((a, b) => b.overlap - a.overlap);
}

/** Questions that ask for ALL items of a kind. The noun says which kind; the kinds are the routes' (react-config.ts). Kept in code,
 * like the loop's exits: it is not a setting a person can tune into answering things the SOP does not say. Only kinds whose
 * passages are one per numbered item (D1, D2, ...) are listed: a fee table is one passage, and needs no gathering. */
const ENUMERATIONS: { noun: RegExp; kind: RouteKind }[] = [
  { noun: /\bdocuments\b/i, kind: "required-documents" },
];

/** Words that name the list or the asking, not the subject: a list question must still carry a subject of the SOP besides these. */
const LIST_WORDS = /^(documents?|required?|requirements?|need|needed|list|name|which|what|please|show)$/;

/** Is a list question about this SOP? Besides the words that name the list and the asking, it has no other content word (a bare
 * "which documents are required", put to an agent that works on this SOP), or at least one of them is a subject term of the SOP
 * (licence, renew, trade: terms found in many of its passages). "Which documents to open a bank account" has three content words
 * and none is a subject term, so it is not. */
export function inScope(question: string, common: Set<string>): boolean {
  const content = [...new Set(words(question))].filter((w) => !FILLER.has(w) && !LIST_WORDS.test(w));
  return content.length === 0 || content.some((w) => common.has(w));
}

/** The passages that ARE the items of a kind: those whose own heading is a numbered item ("D1. Trade name certificate"). */
export function itemChunks<T extends { text: string; topics: string[] }>(chunks: T[], kind: string): T[] {
  return chunks.filter((c) => c.topics.includes(kind) && !c.topics.includes("overview") && /^[A-Z]{1,3}\d+[.:)]/.test(c.text.split("\n")[0].split(" | ").pop()?.trim() ?? ""));
}

/** The kind a "which / what / list ... <plural noun>" question asks to be listed, or null for any other question. */
export function enumerationKind(question: string): RouteKind | null {
  if (!/\b(which|what|list|name)\b/i.test(question)) return null;
  return ENUMERATIONS.find((e) => e.noun.test(question))?.kind ?? null;
}

/** Content words of the question that appear nowhere in the SOP (after the glossary): a place, a body or a thing the SOP never
 * mentions. A list question with one of these is not about this SOP's list, so it is not enumerated. */
export function outOfVocabulary(question: string, chunks: { text: string }[], glossary: GlossaryEntry[] = DEFAULT_REACT_CONFIG.glossary): string[] {
  const vocab = new Set(chunks.flatMap((c) => words(c.text)));
  return [...new Set(words(question))].filter((w) => !FILLER.has(w) && !vocab.has(w) && !words(rewrite(w, glossary)).some((x) => vocab.has(x)));
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
  /** Reflection on a proposed finish (see Reflection). Without it a supported citation is enough, as before. When it fails or
   * the reflector errors the finish is refused (fail closed) and the cited passages are dropped from the supported set. */
  reflect?: Reflector;
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
  const kinds = new Set(sop.flatMap((c) => c.topics));
  const names = unknownNames(question, sop);
  const person = asksForPerson(question);
  const calls: CallDecision[] = [];
  const s: ReactState = { question, steps: [], retrieved: new Map(), supported: new Map() };
  const outside = async (thought: string, why: string): Promise<ReactResult> => {
    const req: OutsideRequest = { question, reason: why, tried: searchedQueries(s) };
    const obs = opts.requestOutside ? await opts.requestOutside(req) : "recorded; no outside source is connected, so a person must answer";
    s.steps.push({ thought, action: { tool: "request_outside_information", question, reason: why }, observation: obs });
    return { status: "outside_kb", steps: s.steps, citations: [], answer: [], outside: req, evidence: [], calls };
  };

  for (let i = 0; i < max; i++) {
    let proposed: { thought: string; action: Action };
    try { proposed = await reason(s); } catch (e) { if (e instanceof SijilBlockedError) throw e; return outside("The reasoner failed, so the answer cannot come from the knowledge base.", `Reasoner error: ${(e as Error).message.slice(0, 120)}`); }
    const { thought } = proposed;
    const checked = checkAction(proposed.action, kinds);
    const rawTool = checked.ok ? checked.action.tool : checked.tool;
    calls.push(simulatedGate({ tool: rawTool, args: {} }, REACT_TOOLS));
    if (!checked.ok) {
      s.steps.push({ thought: `[rejected action: ${checked.tool}] ${String(thought).slice(0, 400)}`, action: { tool: "finish", citations: [] }, observation: `rejected: ${checked.why}` });
      continue;
    }
    const action = checked.action;
    if (action.tool === "search_sop") {
      const hits = await retrieve(action.query, action.kind);
      for (const h of hits) s.retrieved.set(h.chunk.chunk_id, h.chunk);
      const g = groundedHits(hits, action.query, common, !!action.kind, cfg);
      for (const x of g) if (!s.supported.has(x.hit.chunk.chunk_id)) s.supported.set(x.hit.chunk.chunk_id, action.query);
      // a list question: gather every passage of the kind, once. Only for a question about this SOP: it carries a subject term of
      // the SOP (licence, renew, trade...) and no word the SOP never uses (another city, a bank account...).
      if (!s.enumerated?.length) {
        const kind = enumerationKind(question);
        if (kind && inScope(question, common) && outOfVocabulary(question, sop, cfg.glossary).length === 0 && !names.length && !person) {
          const items = itemChunks(sop, kind);
          if (items.length >= 2) {
            for (const c of items) { s.retrieved.set(c.chunk_id, c); if (!s.supported.has(c.chunk_id)) s.supported.set(c.chunk_id, question); }
            s.enumerated = items.map((c) => c.chunk_id);
          }
        }
      }
      s.steps.push({
        thought, action,
        observation: `${hits.map((h) => h.chunk.chunk_id.split("#")[1]).join(", ") || "no hits"}; supporting: ${g.map((x) => x.hit.chunk.chunk_id.split("#")[1]).join(", ") || "none"}${s.enumerated?.length ? `; the question asks for all of them, so every passage of this kind is gathered: ${s.enumerated.map((id) => id.split("#")[1]).join(", ")}` : ""}`,
      });
    } else if (action.tool === "request_outside_information") {
      return outside(thought, action.reason);
    } else {
      let valid = names.length || person ? [] : action.citations.filter((c) => s.supported.has(c));
      // a list question is answered with the whole list, not with whichever item the reasoner happened to cite
      if (valid.length && s.enumerated?.length && valid.some((c) => s.enumerated!.includes(c))) valid = [...s.enumerated];
      if (!valid.length) {
        s.steps.push({ thought, action, observation: person ? "rejected: the question asks for a named person; the SOP names roles, not people" : names.length ? `rejected: the question names ${names.join(", ")}, which the SOP never mentions` : "rejected: no cited chunk was retrieved and shown to support the question" });
        return outside("A finish without a supported citation is not allowed, so the answer cannot come from the knowledge base.", "The answer had no supporting passage in the SOP knowledge base.");
      }
      let cites = valid;
      let verified: { chunk_id: string; quote: string } | null = null;
      if (opts.reflect) {
        const passages = valid.map((id) => ({ chunk_id: id, text: s.retrieved.get(id)!.text.split("\n").slice(1).join("\n") }));
        let refl: Reflection | null = null;
        try { refl = await opts.reflect(question, passages, { list: !!s.enumerated?.length }); } catch (e) { if (e instanceof SijilBlockedError) throw e; refl = { answers: false, quote: "", why: `the reflection step failed: ${(e as Error).message.slice(0, 100)}` }; }
        const v = verifyReflection(refl, passages);
        if (!v.ok) {
          // a rejected finish is not an answer: drop what was cited, so only a new search can support a new one
          s.steps.push({ thought, action, observation: `rejected by reflection: ${v.why}` });
          for (const id of valid) if (!s.enumerated?.includes(id)) s.supported.delete(id);
          continue;
        }
        verified = v;
        cites = s.enumerated?.length ? valid : [v.chunk_id];
      }
      s.steps.push({ thought, action, observation: `accepted: ${cites.join(", ")}${verified ? " (reflection quoted the answer)" : ""}` });
      return {
        status: "answered", steps: s.steps, calls, citations: cites, evidence: cites.map((id) => s.retrieved.get(id)!),
        answer: cites.map((id) => ({ chunk_id: id, quote: verified && verified.chunk_id === id ? verified.quote : bestSentence(s.retrieved.get(id)!.text.split("\n").slice(1).join("\n"), words(s.supported.get(id)!).filter((w) => !FILLER.has(w)).join(" "), 300).sentence })),
      };
    }
  }
  return outside("The step limit was reached without a supported answer.", "No supported answer within the step limit.");
}

export type { SopChunk };
