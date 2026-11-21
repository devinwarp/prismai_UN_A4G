import type {
  AutomationCandidate, AutomationClass, FlagId, LineRef, RiskFlags, SopAnalysis, SopAnalyzer, SopInput, SopStep, StepKind,
} from "./types.ts";

// Reference SOP analyzer: deterministic, offline, no model. Written for this
// repo from the interface in types.ts. Every cue list and share below is a
// SYNTHETIC heuristic for demonstration, not a tuned or measured value.
// ponytail: regex cues cap accuracy on free-form prose; the optional model
// pass (llm.ts) fills actors/systems only, and a person confirms the result.

// ---- 1. Split the text into steps -----------------------------------------
interface Raw { text: string; start: number; end: number; quote: string }
const MARK = /^\s*(?:\d+[.)]|[A-Za-z][.)]|[-*•])\s+(\S.*)$/;
const HEAD = /^\s{0,3}(#{1,6})\s/;

export function splitSteps(text: string): Raw[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const out: Raw[] = [];
  if (lines.some((l) => MARK.test(l))) {
    let cur: Raw | null = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const m = MARK.exec(l);
      if (HEAD.test(l) || !l.trim()) cur = null;
      else if (m) out.push((cur = { text: m[1].trim(), start: i + 1, end: i + 1, quote: m[1].trim() }));
      else if (cur) {
        cur.text += ` ${l.trim()}`;
        cur.end = i + 1;
      }
    }
    return out;
  }
  // Prose: one step per sentence. Skip the title and any preamble before the first "##".
  const firstSection = lines.findIndex((l) => HEAD.exec(l)?.[1].length === 2);
  lines.forEach((l, i) => {
    if (i < (firstSection < 0 ? 0 : firstSection) || !l.trim() || HEAD.test(l)) return;
    for (const s of l.trim().split(/(?<=[.!?])\s+(?=[A-Z])/)) out.push({ text: s, start: i + 1, end: i + 1, quote: s });
  });
  return out;
}

// ---- 2. Kind, actor, systems, minutes --------------------------------------
const STOP = new Set(["the", "a", "an", "and", "or", "to", "by", "that", "with", "of", "if", "when", "then"]);
const ROLE = /\b(?:([a-z]+)\s+)?(clerk|officer|supervisor|manager|reviewer|inspector|committee|chair|analyst|coordinator|registrar|cashier|director|applicant|citizen|customer)\b/gi;
const EXTERNAL_ROLE = new Set(["applicant", "citizen", "customer"]);
const SYS = /\b((?:[A-Z][\w-]*\s+){1,3}(?:[Pp]ortal|[Rr]egist(?:er|ry)|[Ss]ystem|[Dd]atabase|[Qq]ueue|[Pp]latform|[Gg]ateway|[Ll]edger|[Ww]orkbook|[Tt]racker))\b/g;
const GENERIC_SYS = /\b(shared mailbox|spreadsheet|paper form|scanner)\b/gi;
const MINUTES = /(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/i;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function detectActor(t: string): string | null {
  const all = [...t.matchAll(ROLE)];
  // Staff roles win over the people they serve ("when the applicant has ..., the officer escalates").
  const m = all.find((x) => !EXTERNAL_ROLE.has(x[2].toLowerCase())) ?? all[0];
  if (!m) return null;
  const mod = m[1] && !STOP.has(m[1].toLowerCase()) ? `${m[1].toLowerCase()} ` : "";
  return cap(mod + m[2].toLowerCase());
}

export function detectSystems(t: string): string[] {
  const named = [...t.matchAll(SYS)].map((m) => m[1].replace(/^(The|A|An|If|When)\s+/, ""));
  const generic = [...t.matchAll(GENERIC_SYS)].map((m) => cap(m[1].toLowerCase()));
  return [...new Set([...named, ...generic])];
}

function detectMinutes(t: string): number | null {
  const m = MINUTES.exec(t);
  if (!m) return null;
  return Math.round(Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1));
}

function detectKind(t: string): StepKind {
  const lead = /^\s*(if|when|where|unless|in case)\b/i.test(t);
  if (lead && /\b(missing|fails?|failed|incomplete|unable|overdue|error|appeals?|disput\w*)\b/i.test(t)) return "exception";
  if (/\b(forward\w*|escalat\w*|hands? over|refer\w* to|transfer\w* to|pass\w* to)\b/i.test(t)) return "handoff";
  if (lead || /\b(decide[sd]?|determines?)\s+(whether|if)\b/i.test(t)) return "decision";
  return "step";
}

// ---- 3. Automation class ----------------------------------------------------
const KEEP = /\b(approv\w*|decid\w*|determin\w*|sign(?:s|ed)?(?:\s+off)?|grant\w*|impos\w*|suspend\w*|revok\w*|authori[sz]\w*|adjudicat\w*|second opinion)\b/gi;
const ASSIST = /\b(review\w*|draft\w*|assess\w*|prepar\w*|summari[sz]\w*|advis\w*|explain\w*|investigat\w*|evaluat\w*|escalat\w*|contact\w*|interview\w*)\b/gi;
const AUTO = /\b(check\w*|verif\w*|validat\w*|look\w* up|calculat\w*|compar\w*|match\w*|record\w*|log\w*|renam\w*|cop(?:y|ies)|collect\w*|send\w*|email\w*|notif\w*|generat\w*|updat\w*|regist\w*|issu\w*|mov\w*|open\w*|attach\w*|park\w*|forward\w*|releas\w*|clos\w*|index\w*|scan\w*)\b/gi;

interface Cls { class: AutomationClass; cues: string[]; confidence: number }

export function classify(t: string): Cls {
  const words = (re: RegExp) => [...t.matchAll(re)].map((m) => ({ w: m[0].toLowerCase(), i: m.index ?? 0 }));
  const keep = words(KEEP);
  if (keep.length) return { class: "keep_human", cues: keep.map((k) => k.w), confidence: 0.85 };
  const hits = [...words(ASSIST).map((h) => ({ ...h, c: "assist" as const })), ...words(AUTO).map((h) => ({ ...h, c: "automate" as const }))].sort((a, b) => a.i - b.i);
  if (!hits.length) return { class: "keep_human", cues: [], confidence: 0.4 };
  return { class: hits[0].c, cues: hits.filter((h) => h.c === hits[0].c).map((h) => h.w), confidence: 0.8 };
}

// ---- 4. Risk flags -----------------------------------------------------------
const EXTERNAL = /\b(applicants?|citizens?|customers?|clients?|residents?|requesters?|complainants?|licensees?|business owners?|members of the public)\b/i;
const OUTBOUND = /\b(send\w*|tell\w*|email\w*|notif\w*|repl(?:y|ies)|respond\w*|inform\w*|contact\w*|call\w*|letter|message|issu\w*|explain\w*|payment link|receipt)\b/i;
const RIGHTS = /\b(eligib\w*|entitle\w*|waiv\w*|penalt\w*|fines?|suspend\w*|revok\w*|appeal\w*|refund\w*|sanction\w*|exempt\w*|benefit\w*|denied|deny|denies|reject\w*|disqualif\w*)\b/i;
const IRREVERSIBLE = /\b(cannot be undone|can't be undone|irreversib\w*|permanent\w*|final|delet\w*|destroy\w*|purge\w*|terminat\w*|disburs\w*|pay(?:s)? out|releas\w* (?:any |the )?(?:refund|payment|funds))\b/i;

/** The three flags for one piece of text (a step or a task). Same cues as the whole-SOP result. */
export const flagsOfText = (t: string): Record<FlagId, boolean> => ({
  client_facing: EXTERNAL.test(t) && OUTBOUND.test(t),
  affects_rights: RIGHTS.test(t),
  irreversible: IRREVERSIBLE.test(t),
});

function flagsFor(steps: SopStep[]): RiskFlags {
  const hit = (f: FlagId): LineRef[] => steps.filter((s) => flagsOfText(s.text)[f]).map((s) => s.cite).slice(0, 3);
  const evidence: Record<FlagId, LineRef[]> = { client_facing: hit("client_facing"), affects_rights: hit("affects_rights"), irreversible: hit("irreversible") };
  return {
    client_facing: evidence.client_facing.length > 0,
    affects_rights: evidence.affects_rights.length > 0,
    irreversible: evidence.irreversible.length > 0,
    evidence,
  };
}

// ---- 5. Maths ---------------------------------------------------------------
const r1 = (n: number) => Math.round(n * 10) / 10;
const uniq = <T,>(a: T[]) => [...new Set(a)];
/** Distinct actors; a bare "Clerk" is dropped when a qualified "Intake clerk" exists. */
export const actorList = (steps: { actor: string | null }[]) => {
  const all = uniq(steps.flatMap((s) => (s.actor ? [s.actor] : [])));
  return all.filter((a) => a.includes(" ") || !all.some((b) => b !== a && b.toLowerCase().endsWith(` ${a.toLowerCase()}`)));
};

const REASON: Record<AutomationClass, (v: string) => string> = {
  automate: (v) => `Routine, rule-based work (${v}). A system can do it, and a person only handles the exceptions.`,
  assist: (v) => `Needs judgement, but AI can prepare the work (${v}). A person reviews every result.`,
  keep_human: (v) => (v ? `A person must decide or sign off (${v}), so this is not suitable for automation.` : "No clear routine action was found, so it stays with a person."),
};

export function analyzeSop(input: SopInput): SopAnalysis {
  const { baseline: b } = input;
  const warnings: string[] = [];
  const raw = splitSteps(input.text);
  const steps: SopStep[] = raw.map((r, i) => ({
    id: `S${i + 1}`,
    kind: i === 0 && detectKind(r.text) === "step" ? "start" : detectKind(r.text),
    text: r.text,
    actor: detectActor(r.text),
    systems: detectSystems(r.text),
    minutes: detectMinutes(r.text),
    cite: { start: r.start, end: r.end, quote: r.quote },
  }));
  if (steps.length < 3) warnings.push("Fewer than three steps were found. Check that the SOP uses numbered or bulleted steps, or one sentence per step.");
  if (steps.length >= 3) {
    const last = steps[steps.length - 1];
    if (last.kind === "step" && /\b(clos\w*|archiv\w*|complet\w*|finish\w*)\b/i.test(last.text)) last.kind = "end";
  }

  const cases = b.cases_per_year[input.sop_id] ?? b.default_cases_per_year;
  if (b.cases_per_year[input.sop_id] === undefined) warnings.push(`No synthetic volume for "${input.sop_id}": the default of ${b.default_cases_per_year} cases a year was used.`);
  const mins = (s: SopStep) => s.minutes ?? b.default_step_minutes[s.kind];
  const defaulted = steps.filter((s) => s.minutes === null).length;
  if (steps.length) warnings.push(`${defaulted} of ${steps.length} steps had no time in the text, so the synthetic default minutes were used.`);

  const cls = new Map(steps.map((s) => [s.id, classify(s.text)]));
  const candidates: AutomationCandidate[] = (["automate", "assist", "keep_human"] as const).flatMap((c) => {
    const group = steps.filter((s) => cls.get(s.id)!.class === c);
    if (!group.length) return [];
    const hours = r1(group.reduce((n, s) => n + (mins(s) * cases * b.share_by_class[c]) / 60, 0));
    const cues = uniq(group.flatMap((s) => cls.get(s.id)!.cues)).slice(0, 4).join(", ");
    return [{
      step_ids: group.map((s) => s.id),
      class: c,
      reason: REASON[c](cues),
      basis: "rule" as const,
      hours_saved_per_year: hours,
      cost_saved_per_year: Math.round(hours * b.loaded_hourly_rate),
      confidence: Math.round((group.reduce((n, s) => n + cls.get(s.id)!.confidence, 0) / group.length) * 100) / 100,
      cites: group.map((s) => s.cite),
    }];
  });

  const baselineHours = r1(steps.reduce((n, s) => n + (mins(s) * cases) / 60, 0));
  const saved = r1(candidates.reduce((n, c) => n + c.hours_saved_per_year, 0));
  const confidence = steps.length ? Math.round((steps.reduce((n, s) => n + cls.get(s.id)!.confidence, 0) / steps.length) * 100) / 100 : 0;
  return {
    sop_id: input.sop_id,
    analyzer: { name: "rule-sop", version: "1", mode: "deterministic" },
    steps,
    actors: actorList(steps),
    systems: uniq(steps.flatMap((s) => s.systems)),
    candidates,
    totals: {
      cases_per_year: cases,
      baseline_hours_per_year: baselineHours,
      hours_saved_per_year: saved,
      cost_saved_per_year: candidates.reduce((n, c) => n + c.cost_saved_per_year, 0),
      vs_baseline_pct: baselineHours ? r1((saved / baselineHours) * 100) : 0,
      currency: "XXD",
    },
    assumptions: { loaded_hourly_rate: b.loaded_hourly_rate, share_by_class: b.share_by_class },
    flags: flagsFor(steps),
    confidence,
    warnings,
  };
}

export const ruleAnalyzer: SopAnalyzer = { analyze: async (input) => analyzeSop(input) };
