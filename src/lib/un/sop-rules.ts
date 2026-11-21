import type { Chunk } from "./kb.ts";
import { reactAnswer, type OutsideRequest, type Retrieve } from "./react-sop.ts";
import type { DocRules } from "./doc-ocr.ts";

// The figures the licence-renewal agent applies are not in its code: it reads each one out of the
// SOP passage it retrieved (through the ReAct loop) and remembers which chunk it came from. Edit
// the SOP, rebuild the knowledge base, and the agent's behaviour changes; the per-task evals then
// show whether it still behaves. If a figure cannot be found, the loader makes the required
// outside-information call and stops: it never falls back to a number it "knows".

export interface Rules extends DocRules {
  graceDays: number;
  lateFeePct: number;
  noticeDays: number;
  baseFees: Record<string, number>;
  /** rule name -> chunk ids the figure was read from */
  cited: Record<string, string[]>;
  /** chunk id of the how-to-submit passage, quoted to applicants */
  submitChunk: string;
}

export class OutsideInformationRequired extends Error {
  request: OutsideRequest;
  constructor(request: OutsideRequest) {
    super(`not in the SOP knowledge base: ${request.question}`);
    this.request = request;
  }
}

interface Probe<T> { name: string; query: string; read: (text: string) => T | null }
const num = (s: string) => Number(s.replace(/,/g, ""));
const first = (re: RegExp) => (t: string) => { const m = re.exec(t); return m ? num(m[1]) : null; };

const PROBES = {
  graceDays: { query: "licence expired more than days ago blocked outside the grace period", read: first(/expired (?:for )?more than (\d+) days/i) },
  leaseMonths: { query: "how long must the lease run months from the renewal start date", read: first(/at least (\d+) months/i) },
  idValidDays: { query: "owner identity document must be valid how many days after it is submitted", read: first(/for at least (\d+) days after/i) },
  authLetterDays: { query: "authorisation letter dated within the last how many days", read: first(/dated within the last (\d+) days/i) },
  minCover: { query: "insurance certificate minimum cover amount", read: first(/cover of at least ([\d,]+)/i) },
  lateFeePct: { query: "late fee percent of the base renewal fee", read: first(/(\d+)% of base/i) },
  noticeDays: { query: "fee notice how to pay and how many calendar days it is valid", read: first(/valid for (\d+) calendar days/i) },
  baseFees: {
    query: "base renewal fee for each activity group",
    read: (t: string) => {
      const out: Record<string, number> = {};
      for (const m of t.matchAll(/\|\s*([A-Za-z][A-Za-z ]+?)\s*\|\s*([\d,]+)\s*\|\s*\d+%/g)) out[m[1]] = num(m[2]);
      return Object.keys(out).length ? out : null;
    },
  },
} satisfies Record<string, Omit<Probe<unknown>, "name">>;

const body = (c: Chunk) => c.text.split("\n").slice(1).join("\n");

export async function loadRules(sopId: string, retrieve: Retrieve, requestOutside?: (r: OutsideRequest) => Promise<string> | string): Promise<Rules> {
  const cited: Record<string, string[]> = {};
  const got: Record<string, unknown> = {};
  const ask = async (name: string, query: string, read: (t: string) => unknown) => {
    const r = await reactAnswer(sopId, query, { retrieve, requestOutside });
    const value = r.status === "answered" ? r.evidence.map((c) => read(body(c))).find((v) => v !== null) ?? null : null;
    if (value === null) {
      const req: OutsideRequest = r.outside ?? { question: query, reason: "The cited passages do not state this figure.", tried: r.steps.flatMap((s) => (s.action.tool === "search_sop" ? [s.action.query] : [])) };
      if (r.status === "answered") await requestOutside?.(req);
      throw new OutsideInformationRequired(req);
    }
    cited[name] = r.evidence.filter((c) => read(body(c)) !== null).map((c) => c.chunk_id);
    return value;
  };
  for (const [name, p] of Object.entries(PROBES)) got[name] = await ask(name, p.query, p.read as (t: string) => unknown);
  const sub = await reactAnswer(sopId, "how to submit documents: portal, counter, reply to the notice email", { retrieve, requestOutside });
  if (sub.status !== "answered") throw new OutsideInformationRequired(sub.outside!);
  return { ...(got as Omit<Rules, "cited" | "submitChunk">), cited, submitChunk: sub.citations[0] };
}
