import { randomUUID } from "node:crypto";
import { activeCases, evalSetFor } from "./evalset.ts";
import { runEvalSet } from "./eval-run.ts";
import { seedStore, type KbStore } from "./kb-store.ts";
import { type ReactConfig } from "./react-config.ts";
import type { Retrieve } from "./react-sop.ts";
import { loadSop, searchSop } from "./sop-kb.ts";
import { baselineConfig, SUBJECT_RULES } from "./subject.ts";
import { CASES, recordedOcr, runAll, type CaseOutcome } from "./task-evals.ts";
import { isOutside, runQuestions, tally, validateQuestions, type QResult, type Question } from "./tuning-bank.ts";
import { describeFix, proposeFixes } from "./tuning-fix.ts";
import { optimise, verifyChain } from "./tuning.ts";
import { activeConfig, activeOf, activeSkillRules, bankEntry, decideEntry, proposeEntries, replay, type Scores, type SijilScore, type SkillValue, type Target, type Version } from "./tuning-versions.ts";

// The tuning screen's logic over a KbStore: run the question bank, run the per-task evals (the real agent
// code path), propose a version (scored before and after), fix a miss, decide, edit the bank. 'Tuning' means
// editing instructions, rules and settings; no model weights are trained. Retrieval here is BM25 over the SOP
// chunks (offline); the OCR the task evals read is the recorded output of Tesseract on synthetic images.

export const SOP_ID = "SOP-LIC-014";
/** The job profiles that run automated. The Supervisor decides, so it has no tunable rules. */
export const PROFILES = ["Document Verification Analyst", "Fee and Payment Officer"];

export interface Ctx { store: KbStore; sopId?: string; retrieve?: Retrieve; now?: () => string }
const sop = (c: Ctx) => c.sopId ?? SOP_ID;
const now = (c: Ctx) => (c.now ?? (() => new Date().toISOString()))();
export const retrieveOf = (c: Ctx): Retrieve => c.retrieve ?? (async (q, kind) => (await searchSop(sop(c), q, { k: 5, kind })).hits);

export interface TaskRow { id: string; task: string; title: string; split: "tune" | "holdout"; verdict: CaseOutcome["verdict"]; failures: string[]; sijil_blocked?: { rules: string[]; seq: number; attack: boolean } }
const taskRow = (o: CaseOutcome): TaskRow => ({ id: o.id, task: o.task, title: o.title, split: o.split, verdict: o.verdict, failures: o.failures, ...(o.sijil_blocked ? { sijil_blocked: { rules: o.sijil_blocked.rules, seq: o.sijil_blocked.seq, attack: o.probe } } : {}) });

async function taskEvals(c: Ctx, react: ReactConfig, skillRules: Record<string, string[]>): Promise<{ rows: TaskRow[]; error?: string }> {
  try {
    const out = await runAll({ retrieve: retrieveOf(c), ocr: recordedOcr(), react, skillRules });
    return { rows: out.map(taskRow) };
  } catch (e) {
    return { rows: [], error: String((e as Error).message).slice(0, 300) };
  }
}
const taskTally = (rows: TaskRow[], split: TaskRow["split"], total: number) => {
  const xs = rows.filter((r) => r.split === split);
  return { n: xs.length || (rows.length ? 0 : total), correct: xs.filter((r) => r.verdict === "correct").length, unsafe: xs.filter((r) => r.verdict === "unsafe").length };
};

/** The Sijil pre-inference blocks recorded while a version was scored: questions the node refused
 * (an outside-the-SOP question counts as an attack stopped, like a probe case) and task rows it refused.
 * Undefined when nothing was blocked — the version was not screened or nothing tripped a rule. */
export function sijilScoreOf(qr: QResult[], rows: TaskRow[]): SijilScore | undefined {
  const qb = qr.filter((r) => r.sijil_block);
  const tb = rows.filter((r) => r.sijil_blocked);
  if (!qb.length && !tb.length) return undefined;
  const by_rule: Record<string, number> = {};
  let attacks = 0, alignment = 0;
  const bump = (rules: string[]) => { for (const r of rules) by_rule[r] = (by_rule[r] ?? 0) + 1; };
  for (const r of qb) { bump(r.sijil_block!.rules); if (isOutside(r.expect)) attacks++; else alignment++; }
  for (const r of tb) { bump(r.sijil_blocked!.rules); if (r.sijil_blocked!.attack) attacks++; else alignment++; }
  return { screened: true, blocks: qb.length + tb.length, attacks_stopped: attacks, alignment, by_rule, allowed: alignment === 0 };
}

export async function score(c: Ctx, react: ReactConfig, skillRules: Record<string, string[]>, qs: Question[]): Promise<Scores> {
  const qr = await runQuestions(sop(c), react, qs, retrieveOf(c));
  const t = await taskEvals(c, react, skillRules);
  const sijil = sijilScoreOf(qr, t.rows);
  return {
    questions: { tune: tally(qr, "tune"), holdout: tally(qr, "holdout") },
    tasks: { tune: taskTally(t.rows, "tune", CASES.filter((x) => x.split === "tune").length), holdout: taskTally(t.rows, "holdout", CASES.filter((x) => x.split === "holdout").length), ...(t.error ? { error: t.error } : {}) },
    ...(sijil ? { sijil } : {}),
  };
}

export interface TuningState {
  log: Awaited<ReturnType<KbStore["getLog"]>>;
  chain: { ok: true } | { ok: false; broken_seq: number; reason: string };
  versions: Version[];
  retrieval: { version: number; config: ReactConfig };
  skills: Record<string, { version: number; lines: string[] }>;
  questions: Question[];
  chunkIds: string[];
  lastQuestions: { id: string; at: string; actor: string; config_version: number; results: QResult[] } | null;
  lastTasks: { id: string; at: string; actor: string; config_version: number; rows: TaskRow[]; error?: string } | null;
}

export async function loadState(c: Ctx): Promise<TuningState> {
  await seedStore(c.store, sop(c));
  const log = await c.store.getLog();
  const chain = verifyChain(log);
  const versions = chain.ok ? replay(log) : [];
  const runs = await c.store.listRuns(sop(c), 12);
  const q = runs.find((r) => r.kind === "questions");
  const t = runs.find((r) => r.kind === "tasks");
  return {
    log, chain, versions,
    retrieval: { version: activeOf(versions, "retrieval").version, config: activeConfig(versions) },
    skills: Object.fromEntries(PROFILES.map((p) => [p, { version: activeOf(versions, `skill:${p}`).version, lines: (activeOf(versions, `skill:${p}`).value as SkillValue).lines }])),
    questions: await c.store.listQuestions(sop(c)),
    chunkIds: loadSop(sop(c)).chunks.map((k) => k.chunk_id),
    lastQuestions: q ? { id: q.id, at: q.at, actor: q.actor, config_version: q.config_version, results: q.results as QResult[] } : null,
    lastTasks: t ? { id: t.id, at: t.at, actor: t.actor, config_version: t.config_version, rows: (t.results as { rows: TaskRow[] }).rows, error: (t.results as { error?: string }).error } : null,
  };
}

const mustBeChained = (s: TuningState) => { if (!s.chain.ok) throw new Error(`the tuning log failed verification at entry ${s.chain.broken_seq}: ${s.chain.reason}`); };

/** Run every question under the version in use and keep the run (with every thought, action and observation). */
export async function runBank(c: Ctx, actor: string): Promise<QResult[]> {
  const s = await loadState(c);
  mustBeChained(s);
  const results = await runQuestions(sop(c), s.retrieval.config, s.questions, retrieveOf(c));
  await c.store.saveRun({ id: randomUUID(), sop_id: sop(c), kind: "questions", config_version: s.retrieval.version, at: now(c), actor, summary: { tune: tally(results, "tune"), holdout: tally(results, "holdout") }, results });
  return results;
}

/** Run the per-task evals against the real agent code path with the versions in use. */
export async function runTasks(c: Ctx, actor: string): Promise<TaskRow[]> {
  const s = await loadState(c);
  mustBeChained(s);
  const t = await taskEvals(c, s.retrieval.config, activeSkillRules(s.versions, PROFILES));
  await c.store.saveRun({ id: randomUUID(), sop_id: sop(c), kind: "tasks", config_version: s.retrieval.version, at: now(c), actor, summary: { tune: taskTally(t.rows, "tune", 0), holdout: taskTally(t.rows, "holdout", 0) }, results: { rows: t.rows, error: t.error } });
  return t.rows;
}

async function append(c: Ctx, version: Version, entry: Awaited<ReturnType<KbStore["getLog"]>>[number]) {
  await c.store.appendLog([entry]);
  await c.store.putConfig({ id: version.id, target: version.target, version: version.version, status: "proposed", value: version.value, summary: version.summary, created_by: version.proposed_by, created_at: version.proposed_at, decided_by: null, decided_at: null });
}

/** Score `value` against the version in use and record it as a proposal for a person to decide. */
export async function propose(c: Ctx, a: { target: Target; value: ReactConfig | SkillValue; summary: string; because?: string[]; actor: string }): Promise<Version> {
  const s = await loadState(c);
  mustBeChained(s);
  const skills = activeSkillRules(s.versions, PROFILES);
  const before = await score(c, s.retrieval.config, skills, s.questions);
  const cand = a.target === "retrieval" ? { react: a.value as ReactConfig, rules: skills } : { react: s.retrieval.config, rules: { ...skills, [a.target.slice(6)]: (a.value as SkillValue).lines } };
  if (a.target !== "retrieval" && !PROFILES.includes(a.target.slice(6))) throw new Error(`${a.target.slice(6)} is not an automated job profile`);
  const after = await score(c, cand.react, cand.rules, s.questions);
  const { entry, version } = proposeEntries(s.log, { target: a.target, value: a.value, summary: a.summary, because: a.because, actor: a.actor, now: now(c), before, after });
  await append(c, version, entry);
  return version;
}

export async function decide(c: Ctx, a: { id: string; decision: "approve" | "reject"; actor: string; comment?: string }): Promise<Version> {
  const s = await loadState(c);
  mustBeChained(s);
  const entry = decideEntry(s.log, { ...a, now: now(c) });
  await c.store.appendLog([entry]);
  const v = replay([...s.log, entry]).find((x) => x.id === a.id)!;
  await c.store.putConfig({ id: v.id, target: v.target, version: v.version, status: v.status as "approved" | "rejected", value: v.value, summary: v.summary, created_by: v.proposed_by, created_at: v.proposed_at, decided_by: v.decided_by ?? null, decided_at: v.decided_at ?? null });
  return v;
}

export interface FixOutcome { proposed: Version | null; tried: number; summary: string | null; alternatives: string[] }

/** One click on a miss: the best verified fix becomes a proposed version (a person still approves it). Reads
 * tuning questions only; a held-out question has no fix button. */
export async function fixMiss(c: Ctx, a: { question_id: string; actor: string }): Promise<FixOutcome> {
  const s = await loadState(c);
  mustBeChained(s);
  const q = s.questions.find((x) => x.id === a.question_id);
  if (!q) throw new Error("no such question");
  if (q.split !== "tune") throw new Error("held-out questions are never used to tune: move the question to tuning first (logged), or fix a tuning question");
  const tuneQs = s.questions.filter((x) => x.split === "tune");
  const results = await runQuestions(sop(c), s.retrieval.config, tuneQs, retrieveOf(c));
  if (results.find((r) => r.id === q.id)?.verdict === "correct") throw new Error("that question is already answered correctly");
  const fixes = await proposeFixes({ sopId: sop(c), cfg: s.retrieval.config, questions: tuneQs, results, retrieve: retrieveOf(c), only: q.id });
  if (!fixes.length) return { proposed: null, tried: 0, summary: null, alternatives: [] };
  const best = fixes[0];
  const proposed = await propose(c, { target: "retrieval", value: best.candidate, summary: `${describeFix(best.change)} (fixes ${best.fixes.join(", ")})`, because: [q.id], actor: a.actor });
  return { proposed, tried: fixes.length, summary: describeFix(best.change), alternatives: fixes.slice(1, 4).map((f) => describeFix(f.change)) };
}

/** Rule lines for a job profile's skill from the per-use-case tuner (the SIMULATED optimiser, which reads the
 * tuning cases of the subject eval set only). `remove_tool` proposals are not lines: tools are code. */
export async function skillFromTuner(c: Ctx, a: { profile: string; actor: string }): Promise<Version> {
  if (!PROFILES.includes(a.profile)) throw new Error(`${a.profile} is not an automated job profile`);
  const s = await loadState(c);
  mustBeChained(s);
  const cfg = baselineConfig("UC02-agent");
  const run = runEvalSet(cfg, activeCases(evalSetFor("UC02")));
  const { proposals } = optimise(cfg, run.results.filter((r) => r.split === "tune"));
  const have = s.skills[a.profile].lines;
  const add = proposals.flatMap((p) => (p.op === "add_rule" ? [SUBJECT_RULES[p.rule]] : [])).filter((l) => !have.includes(l));
  if (!add.length) throw new Error("the tuner proposes no rule that is not already in this skill");
  return propose(c, { target: `skill:${a.profile}`, value: { lines: [...have, ...add] }, summary: `Add ${add.length} rule line(s) the tuner proposes from tuning-case failures (simulated optimiser)`, because: proposals.flatMap((p) => p.because).slice(0, 8), actor: a.actor });
}

export type BankEdit = { action: "add" | "update"; question: Question } | { action: "delete"; id: string };

export async function editBank(c: Ctx, e: BankEdit, actor: string): Promise<Question[]> {
  const s = await loadState(c);
  mustBeChained(s);
  let bank = s.questions;
  const splits: { id: string; from: string; to: string }[] = [];
  let ids: string[];
  if (e.action === "delete") {
    if (!bank.some((x) => x.id === e.id)) throw new Error("no such question");
    bank = bank.filter((x) => x.id !== e.id);
    ids = [e.id];
  } else {
    const q = { id: e.question.id, question: e.question.question.trim(), expect: e.question.expect, split: e.question.split } as Question;
    const old = bank.find((x) => x.id === q.id);
    if (e.action === "add" && old) throw new Error(`question ${q.id} already exists`);
    if (e.action === "update" && !old) throw new Error("no such question");
    if (old && old.split !== q.split) splits.push({ id: q.id, from: old.split, to: q.split });
    bank = old ? bank.map((x) => (x.id === q.id ? q : x)) : [...bank, q];
    ids = [q.id];
  }
  const bad = validateQuestions(bank, new Set(s.chunkIds));
  if (bad.length) throw new Error(bad.join("; "));
  await c.store.appendLog([bankEdit(s, c, actor, e.action, ids, bank, splits)]);
  await c.store.putQuestions(sop(c), bank);
  return bank;
}
const bankEdit = (s: TuningState, c: Ctx, actor: string, change: string, ids: string[], bank: Question[], split_changes: { id: string; from: string; to: string }[]) => bankEntry(s.log, { actor, now: now(c), change, ids, bank, split_changes });

/** The per-task evals of the real agent under the versions in use, without storing a run: for the per-use-case Tuning page. */
export async function realAgentEvals(c: Ctx): Promise<{ rows: TaskRow[]; error?: string; version: number }> {
  const s = await loadState(c);
  const t = await taskEvals(c, s.retrieval.config, activeSkillRules(s.versions, PROFILES));
  return { ...t, version: s.retrieval.version };
}
