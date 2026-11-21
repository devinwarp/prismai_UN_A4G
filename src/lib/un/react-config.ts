// The settings of the ReAct loop as DATA: glossary, routing and thresholds. They used to be
// constants in react-sop.ts. A person edits them on the tuning screen; each change is a version
// that another person approves. What stays in CODE and cannot be tuned: the two exits of the loop
// (a checked citation, or the required outside-information call), the citation check itself (a
// sentence sharing terms with the question, at least one of them rare in the SOP), the rule that
// a name the SOP never mentions cannot be answered, and the floors below. Pure; no I/O.

export interface GlossaryEntry { from: string[]; to: string }
export const ROUTE_KINDS = ["required-documents", "fees", "decision-rule"] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];
export interface RouteRule { kind: RouteKind; terms: string[] }

export interface ReactConfig {
  /** distinct question terms a sentence must share with it to support an answer (floor 2) */
  minOverlap: number;
  /** share of the question's terms that must be shared (0.4 = 40%) */
  overlapShare: number;
  /** most terms ever required, however long the question */
  maxNeed: number;
  /** a term in more than this share of the SOP's chunks says what the SOP is about, not what a passage answers */
  commonShare: number;
  /** Thought/Action/Observation steps before the loop gives up and goes outside */
  maxSteps: number;
  glossary: GlossaryEntry[];
  routes: RouteRule[];
}

/** Safe range per numeric setting. `min` is a floor enforced in code (validateConfig), not a UI hint. */
export const RANGES = {
  minOverlap: { min: 2, max: 4, step: 1, why: "One shared word is not support. Two is the floor." },
  overlapShare: { min: 0.3, max: 0.7, step: 0.05, why: "Below 30% a long question is supported by a passing mention." },
  maxNeed: { min: 3, max: 6, step: 1, why: "The most terms ever required." },
  commonShare: { min: 0.1, max: 0.4, step: 0.05, why: "Terms in more than this share of chunks do not count as support." },
  maxSteps: { min: 3, max: 8, step: 1, why: "The default plan needs up to five steps; fewer than three cannot rewrite and retry." },
} as const satisfies Record<string, { min: number; max: number; step: number; why: string }>;

export const LIMITS = { glossaryEntries: 80, termsPerEntry: 12, termLength: 40, routeTerms: 30 } as const;

const rw = (from: string[], to: string): GlossaryEntry => ({ from, to });
export const DEFAULT_REACT_CONFIG: ReactConfig = {
  minOverlap: 2,
  overlapShare: 0.4,
  maxNeed: 4,
  commonShare: 0.2,
  maxSteps: 6,
  glossary: [
    rw(["permit", "permits", "permission"], "licence"),
    rw(["license"], "licence"),
    rw(["papers", "paperwork", "docs", "paper"], "documents"),
    rw(["tenancy", "rental", "rent contract", "tenancy agreement"], "lease"),
    rw(["extend", "extension", "prolong", "renewal", "renew", "re-new", "re-newal"], "renew"),
    rw(["foreigner", "expat", "expatriate", "overseas"], "non-national"),
    rw(["commercial", "business"], "trade"),
    rw(["hand in", "hand over", "bring", "upload", "send in", "provide"], "submit"),
    rw(["late charge", "penalty fee", "surcharge", "extra charge"], "late fee"),
    rw(["cost", "price", "charge", "charged", "how much"], "fee"),
    rw(["ran out", "lapsed", "ended", "has expired", "run out"], "expired"),
    rw(["sign off", "signs off", "allowed to approve", "authorise", "authorize", "authorises"], "approve decide"),
    rw(["waiting", "pending", "stalled"], "on hold"),
    rw(["answer", "response", "turnaround", "how long"], "timings working days"),
  ],
  routes: [
    { kind: "required-documents", terms: ["documents", "document", "lease", "insurance", "identity", "translation", "submit", "upload", "file type", "format"] },
    { kind: "fees", terms: ["fee", "fees", "late fee", "pay", "payment"] },
    { kind: "decision-rule", terms: ["approve", "decide", "reject", "appeal"] },
  ],
};

const TERM = /^[a-z][a-z -]*$/;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** One alternation over the terms, in the order given (so an earlier term wins over a later one). */
export const termRegex = (terms: string[], flags = "g") => new RegExp(`\\b(?:${terms.map(escapeRe).join("|")})\\b`, flags);

/** Every problem with a config, empty when it is safe. This is the enforcement point for floors and ranges. */
export function validateConfig(c: unknown): string[] {
  const e: string[] = [];
  if (!c || typeof c !== "object") return ["config must be an object"];
  const x = c as Record<string, unknown>;
  for (const [k, r] of Object.entries(RANGES)) {
    const v = x[k];
    if (typeof v !== "number" || !Number.isFinite(v)) e.push(`${k} must be a number`);
    else if (v < r.min || v > r.max) e.push(`${k} must be between ${r.min} and ${r.max} (got ${v})`);
  }
  if (typeof x.minOverlap === "number" && !Number.isInteger(x.minOverlap)) e.push("minOverlap must be a whole number");
  if (typeof x.maxNeed === "number" && typeof x.minOverlap === "number" && x.maxNeed < x.minOverlap) e.push("maxNeed cannot be below minOverlap");
  if (!Array.isArray(x.glossary)) e.push("glossary must be a list");
  else {
    if (x.glossary.length > LIMITS.glossaryEntries) e.push(`at most ${LIMITS.glossaryEntries} glossary entries`);
    x.glossary.forEach((g, i) => {
      const t = g as Partial<GlossaryEntry>;
      if (!Array.isArray(t?.from) || !t.from.length || t.from.length > LIMITS.termsPerEntry) return void e.push(`glossary entry ${i + 1}: 1 to ${LIMITS.termsPerEntry} terms to replace`);
      for (const f of t.from) if (typeof f !== "string" || f.length > LIMITS.termLength || !TERM.test(f)) e.push(`glossary entry ${i + 1}: "${String(f)}" must be lower-case letters, spaces and hyphens only`);
      if (typeof t.to !== "string" || t.to.length > LIMITS.termLength || !TERM.test(t.to)) e.push(`glossary entry ${i + 1}: replacement must be lower-case letters, spaces and hyphens only`);
    });
  }
  if (!Array.isArray(x.routes)) e.push("routes must be a list");
  else {
    const seen = new Set<string>();
    for (const r of x.routes as Partial<RouteRule>[]) {
      if (!r || !(ROUTE_KINDS as readonly string[]).includes(String(r.kind))) { e.push(`route kind must be one of ${ROUTE_KINDS.join(", ")}`); continue; }
      if (seen.has(r.kind!)) e.push(`route ${r.kind} appears twice`);
      seen.add(r.kind!);
      if (!Array.isArray(r.terms) || r.terms.length > LIMITS.routeTerms) e.push(`route ${r.kind}: at most ${LIMITS.routeTerms} terms`);
      else for (const t of r.terms) if (typeof t !== "string" || t.length > LIMITS.termLength || !TERM.test(t)) e.push(`route ${r.kind}: "${String(t)}" must be lower-case letters, spaces and hyphens only`);
    }
  }
  return e;
}

/** Throws with every problem, or returns the config typed. */
export function assertConfig(c: unknown): ReactConfig {
  const e = validateConfig(c);
  if (e.length) throw new Error(e.join("; "));
  return c as ReactConfig;
}

/** Keep only the known fields, so stray keys in a request body cannot reach the log. */
export function pickConfig(c: ReactConfig): ReactConfig {
  return {
    minOverlap: c.minOverlap, overlapShare: c.overlapShare, maxNeed: c.maxNeed, commonShare: c.commonShare, maxSteps: c.maxSteps,
    glossary: c.glossary.map((g) => ({ from: [...g.from], to: g.to })),
    routes: c.routes.map((r) => ({ kind: r.kind, terms: [...r.terms] })),
  };
}

// ---- the agent's own instructions: tuned rule lines added to a job profile's skill -----------------

export const SKILL_LIMITS = { lines: 12, length: 300 } as const;

/** Problems with the rule lines a person adds to a skill. The skill's own text (copied from the SOP:
 * role, authority, tasks, controls) is never edited: lines are appended after it. A line cannot be a
 * heading, so it cannot add a task (the agent reads its authority from the `### Txx` headings). */
export function validateSkillLines(lines: unknown): string[] {
  if (!Array.isArray(lines)) return ["rule lines must be a list"];
  const e: string[] = [];
  if (lines.length > SKILL_LIMITS.lines) e.push(`at most ${SKILL_LIMITS.lines} rule lines`);
  lines.forEach((l, i) => {
    if (typeof l !== "string" || !l.trim()) return void e.push(`line ${i + 1} is empty`);
    if (l.length > SKILL_LIMITS.length) e.push(`line ${i + 1} is longer than ${SKILL_LIMITS.length} characters`);
    if (/[\n\r]/.test(l)) e.push(`line ${i + 1} must be a single line`);
    if (/^\s*(#|---|```)/.test(l)) e.push(`line ${i + 1} cannot be a heading or a code fence: tasks and authority come from the SOP, not from tuning`);
  });
  return e;
}

/** The skill with a person-approved "Tuned rules" section appended. */
export function withTunedRules<S extends { markdown: string }>(skill: S, lines: string[]): S {
  const bad = validateSkillLines(lines);
  if (bad.length) throw new Error(bad.join("; "));
  if (!lines.length) return skill;
  return { ...skill, markdown: `${skill.markdown}\n## Tuned rules (each approved by a person; the SOP and the controls above win)\n${lines.map((l, i) => `${i + 1}. ${l.trim()}`).join("\n")}\n` };
}
