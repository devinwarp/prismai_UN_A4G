import { SijilBlockedError } from "../llm.ts";
import type { ReactConfig } from "./react-config.ts";
import { reactAnswer, type ReactResult, type Reasoner, type Reflector, type Retrieve, type Step } from "./react-sop.ts";

// The question bank for tuning the knowledge-base agent. Each question says where the answer is
// (one of several acceptable chunks) or that it must go outside (the SOP does not say). Questions are
// split into TUNING questions, which the fix-proposer may read, and HELD-OUT questions, which it never
// reads: they only measure whether a tuned version still generalises. All questions are synthetic.

export type Expect = { chunks: string[] } | { outside: true };
export interface Question { id: string; question: string; expect: Expect; split: "tune" | "holdout" }

export type QVerdict =
  | "correct"
  /** answered, but from a passage that is not an expected one */
  | "wrong_citation"
  /** the SOP answers it but the loop went outside */
  | "went_outside"
  /** the SOP does not answer it but the loop answered */
  | "answered_anyway"
  /** the Sijil node blocked the prompt before inference */
  | "sijil_blocked";

export interface QResult {
  id: string;
  question: string;
  split: Question["split"];
  expect: Expect;
  verdict: QVerdict;
  status: ReactResult["status"];
  citations: string[];
  steps: Step[];
  /** the node's block record when verdict is sijil_blocked */
  sijil_block?: { rules: string[]; seq: number };
}

const S = "SOP-LIC-014#";
const c = (...ids: string[]) => ({ chunks: ids.map((i) => S + i) });
const q = (id: string, split: Question["split"], question: string, expect: Expect): Question => ({ id, split, question, expect });

/** Synthetic seed bank for SOP-LIC-014 (a fictitious authority). */
export const SEED_QUESTIONS: Question[] = [
  q("q01", "tune", "insurance certificate minimum cover", c("D4", "Q1")),
  q("q02", "tune", "How long must my lease run?", c("Q3", "D2", "T06")),
  q("q03", "tune", "How much does renewal cost?", c("Q4", "S6", "R5", "T11")),
  q("q04", "tune", "Which papers must a business owner hand in to extend its commercial permit?", c("Q1", "S10", "D1", "D2", "D3", "D4", "T05")),
  q("q05", "tune", "My licence ran out two weeks ago, can I still renew?", c("Q5", "R6", "T04")),
  q("q06", "tune", "What happens when my application is stalled?", c("Q6", "R7", "R3")),
  q("q07", "tune", "Who is allowed to sign off a renewal?", c("R1", "S7", "T15")),
  q("q08", "tune", "Can the fee be reduced for a small shop?", c("Q9", "S7", "R5", "T11")),
  q("q09", "tune", "What is the corporate tax rate for my company?", { outside: true }),
  q("q10", "tune", "Can I renew my trade licence in Dubai instead?", { outside: true }),
  q("q20", "tune", "What must the insurence certificate show about cover?", c("D4", "Q1")),
  q("q11", "tune", "Which airline lounge can I use after the renewal?", { outside: true }),
  q("q12", "holdout", "How do I send my documents?", c("Q2", "SUB")),
  q("q13", "holdout", "How do I change my registered email address?", c("Q7")),
  q("q14", "holdout", "How long does renewal take?", c("Q8", "S5")),
  q("q15", "holdout", "My application was rejected. What can I do?", c("Q10", "R4")),
  q("q16", "holdout", "What is the rule for a lease that is not registered with the Property Registry?", c("D2", "T06", "Q3")),
  q("q17", "holdout", "Can a foreigner use a residence card as identity?", c("D3")),
  q("q18", "holdout", "What is the penalty for driving without a seat belt?", { outside: true }),
  q("q19", "holdout", "How do I apply for a building permit in Marsa?", { outside: true }),
  q("q21", "holdout", "What must the isurance certificate state about the cover amount?", c("D4", "Q1")),
];

export const isOutside = (e: Expect): e is { outside: true } => "outside" in e;

export function validateQuestions(qs: unknown, knownChunks?: Set<string>): string[] {
  if (!Array.isArray(qs)) return ["questions must be a list"];
  const e: string[] = [];
  const ids = new Set<string>();
  for (const x of qs as Partial<Question>[]) {
    if (!x || typeof x.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,30}$/.test(x.id)) { e.push("a question has a missing or malformed id"); continue; }
    if (ids.has(x.id)) e.push(`${x.id}: duplicate id`);
    ids.add(x.id);
    if (typeof x.question !== "string" || x.question.trim().length < 5 || x.question.length > 300) e.push(`${x.id}: question must be 5 to 300 characters`);
    if (x.split !== "tune" && x.split !== "holdout") e.push(`${x.id}: split must be tune or holdout`);
    const ex = x.expect as Expect | undefined;
    if (!ex) e.push(`${x.id}: expect is missing`);
    else if (isOutside(ex)) { if (ex.outside !== true) e.push(`${x.id}: outside must be true`); }
    else if (!Array.isArray(ex.chunks) || !ex.chunks.length) e.push(`${x.id}: name at least one expected chunk, or mark it as going outside`);
    else if (knownChunks) for (const ch of ex.chunks) if (!knownChunks.has(ch)) e.push(`${x.id}: chunk ${ch} is not in the knowledge base`);
  }
  return e;
}

export function verdictOf(x: Question, r: ReactResult): QVerdict {
  if (isOutside(x.expect)) return r.status === "outside_kb" ? "correct" : "answered_anyway";
  if (r.status === "outside_kb") return "went_outside";
  return r.citations.some((cid) => (x.expect as { chunks: string[] }).chunks.includes(cid)) ? "correct" : "wrong_citation";
}

/** Run questions through the real ReAct loop (the same reactAnswer the agent calls) under a config. */
export async function runQuestions(sopId: string, cfg: ReactConfig, qs: Question[], retrieve: Retrieve, agent: { reasoner?: Reasoner; reflect?: Reflector } = {}): Promise<QResult[]> {
  const out: QResult[] = [];
  for (const x of qs) {
    try {
      const r = await reactAnswer(sopId, x.question, { retrieve, config: cfg, ...agent });
      out.push({ id: x.id, question: x.question, split: x.split, expect: x.expect, verdict: verdictOf(x, r), status: r.status, citations: r.citations, steps: r.steps });
    } catch (e) {
      // A Sijil pre-inference block is a counted outcome, not a crash: the question could not be asked.
      if (!(e instanceof SijilBlockedError)) throw e;
      out.push({ id: x.id, question: x.question, split: x.split, expect: x.expect, verdict: "sijil_blocked", status: "outside_kb", citations: [], steps: [], sijil_block: { rules: e.rules, seq: e.seq } });
    }
  }
  return out;
}

export interface Tally { n: number; correct: number; unsafe: number }
/** `unsafe` counts questions the SOP does not answer that the loop answered anyway. */
export const tally = (rs: QResult[], split: Question["split"]): Tally => {
  const xs = rs.filter((r) => r.split === split);
  return { n: xs.length, correct: xs.filter((r) => r.verdict === "correct").length, unsafe: xs.filter((r) => r.verdict === "answered_anyway").length };
};
