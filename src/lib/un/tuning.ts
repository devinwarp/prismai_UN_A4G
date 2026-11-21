import { createHash } from "node:crypto";
import { activeCases, type Designation, type EvalCase } from "./evalset.ts";
import { alignment, runEvalSet, type CaseResult, type EvalRun, type Tally } from "./eval-run.ts";
import { SUBJECT_RULES, type SubjectConfig, type SubjectRule } from "./subject.ts";

// The fine-tuning stage. An optimiser agent reads the failures on the TUNING cases only and
// proposes changes to the agent's rules, system prompt and tools; each change set becomes a new
// agent version that is re-evaluated. The held-out cases decide approval and are never shown to the
// optimiser: a held-out case that fails has been seen, so it is burned (moved into tuning) and a
// fresh reserve case takes its place. Every step is appended to a hash-chained log, so the
// improvement over time is provable and any edit to the history is detectable.
//
// The optimiser here is SIMULATED (deterministic, rule-based); an LLM-backed one would return the
// same Proposal shape. Pure; no I/O.

export type Proposal =
  | { id: string; op: "add_rule"; rule: SubjectRule; summary: string; because: string[] }
  | { id: string; op: "remove_tool"; tool: string; summary: string; because: string[] };

/** A finding the optimiser cannot fix by itself: reported for a person to look at. */
export interface Advisory {
  area: "tool" | "memory" | "prompt";
  text: string;
  because: string[];
  /** For a prompt advisory: the rule that is in place but not working. */
  rule?: SubjectRule;
}

export interface Optimised {
  proposals: Proposal[];
  advisories: Advisory[];
}

/** Reads tuning results only. Passing a held-out result is a programming error, not a choice. */
export function optimise(cfg: SubjectConfig, results: CaseResult[]): Optimised {
  if (results.some((r) => r.split !== "tune")) throw new Error("the optimiser may read tuning cases only");
  const proposals = new Map<string, Proposal>();
  const advisories: Advisory[] = [];
  const addRule = (rule: SubjectRule, caseId: string) => {
    if (cfg.rules.includes(rule)) return;
    const id = `add_rule:${rule}`;
    const p = proposals.get(id);
    if (p) p.because.push(caseId);
    else proposals.set(id, { id, op: "add_rule", rule, summary: `Add the rule “${SUBJECT_RULES[rule]}”`, because: [caseId] });
  };
  const stale = new Set<SubjectRule>();
  const note = (rule: SubjectRule, caseId: string) => {
    if (cfg.rules.includes(rule)) stale.add(rule);
    else addRule(rule, caseId);
  };

  for (const r of results) {
    for (const f of r.findings) {
      if (f.kind === "hallucination" || f.kind === "should_have_handed_over") note("answer_from_record_only", r.case_id);
      else if (f.kind === "missing_disclosure") note("disclose_ai", r.case_id);
    }
    for (const d of r.decisions) {
      if (d.decision !== "reject") continue;
      if (d.reason === "human_release_missing") note("officer_release", r.case_id);
      if (d.reason === "tool_not_authorised") {
        note("use_only_allowed_tools", r.case_id);
        if (cfg.tools.includes(d.call.tool)) {
          const id = `remove_tool:${d.call.tool}`;
          const p = proposals.get(id);
          if (p) p.because.push(r.case_id);
          else proposals.set(id, { id, op: "remove_tool", tool: d.call.tool, summary: `Remove the tool “${d.call.tool}”, which Sijil does not authorise`, because: [r.case_id] });
        }
      }
    }
    if (r.findings.some((f) => f.kind === "missing_fact")) {
      advisories.push({ area: "memory", text: "An expected fact was not stated. Check whether context is being lost between steps (memory) or a skill is missing.", because: [r.case_id] });
    }
  }
  for (const rule of stale) {
    advisories.push({ area: "prompt", text: `The rule “${SUBJECT_RULES[rule]}” is already in place but failures remain on tuning cases. A person should look at how it is worded or enforced.`, because: results.filter((r) => r.verdict !== "correct").map((r) => r.case_id), rule });
  }
  return { proposals: [...proposals.values()].map((p) => ({ ...p, because: [...new Set(p.because)] })), advisories };
}

/** The next agent version: a rule adds its text to the system prompt; a removed tool leaves the tool list. */
export function applyProposals(cfg: SubjectConfig, proposals: Proposal[]): SubjectConfig {
  const rules = [...cfg.rules];
  let tools = [...cfg.tools];
  let prompt = cfg.system_prompt;
  for (const p of proposals) {
    if (p.op === "add_rule" && !rules.includes(p.rule)) {
      rules.push(p.rule);
      prompt += `\n- ${SUBJECT_RULES[p.rule]}`;
    } else if (p.op === "remove_tool") tools = tools.filter((t) => t !== p.tool);
  }
  return { ...cfg, version: cfg.version + 1, rules, tools, system_prompt: prompt };
}

// ---- the hash-chained iteration log -------------------------------------------------------

export type LogKind = "baseline" | "iteration" | "certification" | "holdout_burned" | "approval";

/** One entry of a hash-chained log. The tuning log and the production watchdog log share this shape. */
export interface ChainEntry<K extends string = string> {
  seq: number;
  kind: K;
  at: string;
  actor: string;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

export type LogEntry = ChainEntry<LogKind>;

export const GENESIS = "0".repeat(64);

/** JSON with sorted keys, so a hash survives a database round trip (jsonb does not keep key order). */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

const entryHash = (e: Omit<ChainEntry, "hash">) =>
  createHash("sha256").update(`${e.prev_hash}|${e.seq}|${e.kind}|${e.at}|${e.actor}|${canon(e.payload)}`, "utf8").digest("hex");

export function appendEntry<K extends string>(prev: ChainEntry<K> | null, kind: K, actor: string, payload: Record<string, unknown>, at: string): ChainEntry<K> {
  const e = { seq: (prev?.seq ?? 0) + 1, kind, at, actor, payload, prev_hash: prev?.hash ?? GENESIS };
  return { ...e, hash: entryHash(e) };
}

export function verifyChain(entries: ChainEntry[]): { ok: true } | { ok: false; broken_seq: number; reason: string } {
  let prev = GENESIS;
  for (const [i, e] of entries.entries()) {
    if (e.seq !== i + 1) return { ok: false, broken_seq: e.seq, reason: "sequence gap" };
    if (e.prev_hash !== prev) return { ok: false, broken_seq: e.seq, reason: "previous hash does not match" };
    if (entryHash(e) !== e.hash) return { ok: false, broken_seq: e.seq, reason: "entry was changed after it was written" };
    prev = e.hash;
  }
  return { ok: true };
}

// ---- state replayed from the log ---------------------------------------------------------

export const designationOf = (entries: LogEntry[]): Designation => {
  const d: Designation = { promoted: [], released: [] };
  for (const e of entries) {
    if (e.kind !== "holdout_burned") continue;
    d.promoted.push(...(e.payload.burned as string[]));
    d.released.push(...(e.payload.released as string[]));
  }
  return d;
};

/** The agent configuration at the head of the log, or null before any run. */
export const configOf = (entries: LogEntry[]): SubjectConfig | null => {
  for (let i = entries.length - 1; i >= 0; i--) {
    const c = entries[i].payload.config;
    if (c && typeof c === "object") return c as SubjectConfig;
  }
  return null;
};

export type ApprovalState = "none" | "ready" | "approved";

/** ready: the latest certification met the bar and nothing has changed since. approved: a person signed it. */
export function approvalState(entries: LogEntry[]): ApprovalState {
  const last = entries[entries.length - 1];
  if (!last) return "none";
  if (last.kind === "approval" && last.payload.decision === "SIGN") return "approved";
  if (last.kind === "certification" && last.payload.met === true) return "ready";
  return "none";
}

// ---- one tuning cycle --------------------------------------------------------------------

export type StopReason = "certified" | "no_proposals" | "no_reserve" | "max_rounds";

export interface CycleInput {
  base: SubjectConfig;
  all: EvalCase[];
  designation: Designation;
  actor: string;
  now: () => string;
  /** Head of the existing log, to continue the chain. */
  prev?: LogEntry | null;
  maxIterations?: number;
  maxRounds?: number;
}

export interface CycleOutput {
  entries: LogEntry[];
  /** Every run made, in order (a version can be run again after a held-out case is burned). */
  runs: EvalRun[];
  config: SubjectConfig;
  designation: Designation;
  stopped: StopReason;
}

const brief = (t: Tally) => ({ n: t.n, correct: t.correct, hallucinated: t.hallucinated, misaligned: t.misaligned, incomplete: t.incomplete });

/** Tune until the tuning cases are clean, certify on the held-out cases, and if that fails burn the failing
 * held-out cases, release reserves and go again. Stops when certified or when it cannot go on. */
export function runTuningCycle(input: CycleInput): CycleOutput {
  const maxIterations = input.maxIterations ?? 4;
  const maxRounds = input.maxRounds ?? 3;
  let cfg = input.base;
  let d: Designation = { promoted: [...input.designation.promoted], released: [...input.designation.released] };
  let prev = input.prev ?? null;
  const entries: LogEntry[] = [];
  const runs: EvalRun[] = [];
  const push = (kind: LogKind, payload: Record<string, unknown>) => {
    const e = appendEntry(prev, kind, input.actor, payload, input.now());
    entries.push(e);
    prev = e;
  };
  const evaluate = () => {
    const r = runEvalSet(cfg, activeCases(input.all, d));
    runs.push(r);
    return r;
  };

  let run = evaluate();
  push("baseline", { version: cfg.version, config: cfg, tune: brief(run.summary.tune), holdout: brief(run.summary.holdout), sijil: { calls: run.summary.sijil.calls, rejected: run.summary.sijil.rejected }, run_sha256: run.sha256 });

  let stopped: StopReason = "max_rounds";
  rounds: for (let round = 1; round <= maxRounds; round++) {
    for (let it = 0; it < maxIterations && run.summary.tune.correct < run.summary.tune.n; it++) {
      const { proposals, advisories } = optimise(cfg, run.results.filter((r) => r.split === "tune"));
      if (!proposals.length) {
        stopped = "no_proposals";
        break rounds;
      }
      const before = run.summary.tune;
      const from = cfg.version;
      cfg = applyProposals(cfg, proposals);
      run = evaluate();
      push("iteration", { from_version: from, to_version: cfg.version, proposals, advisories, config: cfg, tune_before: brief(before), tune_after: brief(run.summary.tune), holdout_sealed: true, run_sha256: run.sha256 });
    }
    const al = alignment(run.summary);
    push("certification", { version: cfg.version, met: al.met, reasons: al.reasons, holdout: brief(run.summary.holdout), holdout_lower: al.holdout_lower, sijil: { calls: run.summary.sijil.calls, rejected: run.summary.sijil.rejected }, run_sha256: run.sha256 });
    if (al.met) {
      stopped = "certified";
      break;
    }
    const burned = run.results.filter((r) => r.split === "holdout" && r.verdict !== "correct").map((r) => r.case_id);
    const reserve = input.all.filter((c) => c.split === "reserve" && !d.released.includes(c.id)).map((c) => c.id);
    if (!burned.length || reserve.length < burned.length) {
      stopped = "no_reserve";
      break;
    }
    const released = reserve.slice(0, burned.length);
    d = { promoted: [...d.promoted, ...burned], released: [...d.released, ...released] };
    push("holdout_burned", { version: cfg.version, burned, released, reason: "These held-out cases failed, so the optimiser may now see them. Fresh reserve cases take their place." });
    run = evaluate();
  }
  return { entries, runs, config: cfg, designation: d, stopped };
}
