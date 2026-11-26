import { createHash } from "node:crypto";
import { assertConfig, DEFAULT_REACT_CONFIG, pickConfig, validateSkillLines, type ReactConfig } from "./react-config.ts";
import type { Question, Tally } from "./tuning-bank.ts";
import { appendEntry, canon, verifyChain, type ChainEntry } from "./tuning.ts";

// Every change to what the agent uses is a VERSION in a hash-chained log: a proposal (with the scores
// before and after), then a person's decision. The agent uses the latest approved version of each target
// ("retrieval" = glossary, routing and thresholds; "skill:<profile>" = the rule lines appended to that
// job profile's skill). Version 0 of a target is the built-in default. Nothing is trained: a version is a
// settings file or a list of rule lines. Pure; no I/O. The chain primitives are the ones the per-use-case
// tuning log already uses (tuning.ts).

export type Target = "retrieval" | `skill:${string}`;
export type TuningKind = "proposed" | "approved" | "rejected" | "bank_edit";
export type TuningEntry = ChainEntry<TuningKind>;

export interface SkillValue { lines: string[] }
export type Value = ReactConfig | SkillValue;

/** How the Sijil node's pre-inference screening answered while a version was scored. */
export interface SijilScore {
  /** a screened call was possible (a block was recorded or screening was configured) */
  screened: boolean;
  /** runs/questions the node blocked before inference */
  blocks: number;
  /** blocks that stopped a hostile or refusal-expected input */
  attacks_stopped: number;
  /** blocks on ordinary inputs — the version's own wording tripped a rule */
  alignment: number;
  /** block count per matched policy rule id */
  by_rule: Record<string, number>;
  /** inference was allowed: no alignment block (an attack block still lets normal prompts through) */
  allowed: boolean;
}

/** Question and task-eval scores, per split. `unsafe` = answered a question the SOP does not answer, or broke a control. */
export interface Scores {
  questions: { tune: Tally; holdout: Tally };
  tasks: { tune: Tally; holdout: Tally; error?: string };
  /** present when pre-inference screening recorded at least one block while scoring this version */
  sijil?: SijilScore;
}

export interface Version {
  id: string;
  target: Target;
  version: number;
  base_version: number;
  value: Value;
  summary: string;
  because: string[];
  proposed_by: string;
  proposed_at: string;
  before: Scores;
  after: Scores;
  status: "proposed" | "approved" | "rejected";
  decided_by?: string;
  decided_at?: string;
  comment?: string;
}

export const isSkillTarget = (t: string): t is `skill:${string}` => /^skill:[A-Za-z][A-Za-z ]{2,60}$/.test(t);
export const versionId = (t: Target, v: number) => `${t}@v${v}`;
export const sha = (v: unknown) => createHash("sha256").update(canon(v), "utf8").digest("hex");

export function validateValue(target: string, value: unknown): string[] {
  if (target === "retrieval") { try { assertConfig(value); return []; } catch (e) { return String((e as Error).message).split("; "); } }
  if (isSkillTarget(target)) return validateSkillLines((value as SkillValue | undefined)?.lines);
  return [`unknown target ${target}`];
}

/** Replay the log: every version, with its decision. Throws on a broken chain. */
export function replay(log: TuningEntry[]): Version[] {
  const v = verifyChain(log);
  if (!v.ok) throw new Error(`the tuning log failed verification at entry ${v.broken_seq}: ${v.reason}`);
  const byId = new Map<string, Version>();
  for (const e of log) {
    const p = e.payload as Record<string, unknown>;
    if (e.kind === "proposed") byId.set(String(p.id), { ...(p as unknown as Omit<Version, "status">), proposed_by: e.actor, proposed_at: e.at, status: "proposed" });
    else if ((e.kind === "approved" || e.kind === "rejected") && byId.has(String(p.id))) Object.assign(byId.get(String(p.id))!, { status: e.kind, decided_by: e.actor, decided_at: e.at, comment: typeof p.comment === "string" ? p.comment : undefined });
  }
  return [...byId.values()];
}

/** The version the agent uses for a target: the latest approved, or the built-in default (v0). */
export function activeOf(versions: Version[], target: Target): { version: number; value: Value } {
  const a = versions.filter((x) => x.target === target && x.status === "approved").sort((x, y) => y.version - x.version)[0];
  if (a) return { version: a.version, value: a.value };
  return { version: 0, value: target === "retrieval" ? DEFAULT_REACT_CONFIG : { lines: [] } };
}

export const activeConfig = (versions: Version[]) => activeOf(versions, "retrieval").value as ReactConfig;
export const activeSkillRules = (versions: Version[], profiles: string[]): Record<string, string[]> =>
  Object.fromEntries(profiles.map((p) => [p, (activeOf(versions, `skill:${p}`).value as SkillValue).lines]));

const head = (log: TuningEntry[]) => log[log.length - 1] ?? null;

export function proposeEntries(log: TuningEntry[], a: { target: Target; value: Value; summary: string; because?: string[]; actor: string; now: string; before: Scores; after: Scores }): { entry: TuningEntry; version: Version } {
  const problems = validateValue(a.target, a.value);
  if (problems.length) throw new Error(problems.join("; "));
  const versions = replay(log);
  const value = a.target === "retrieval" ? pickConfig(a.value as ReactConfig) : { lines: (a.value as SkillValue).lines.map((l) => l.trim()) };
  const n = Math.max(0, ...versions.filter((x) => x.target === a.target).map((x) => x.version)) + 1;
  const base = activeOf(versions, a.target).version;
  const payload = { id: versionId(a.target, n), target: a.target, version: n, base_version: base, value, summary: a.summary.slice(0, 300), because: a.because ?? [], before: a.before, after: a.after, value_sha256: sha(value) };
  const entry = appendEntry(head(log), "proposed", a.actor, payload, a.now);
  return { entry, version: { ...(payload as unknown as Version), proposed_by: a.actor, proposed_at: a.now, status: "proposed" } };
}

/** A person's decision on a proposed version. Code refuses: an unknown or already-decided version, a
 * stale one (another version of the target was approved since it was proposed), a value that fails
 * validation (re-checked, so a log edit cannot smuggle a value past the floors), and an approval
 * whose after-scores show the agent breaking a control (`unsafe`). Everything else is the person's call. */
export function decideEntry(log: TuningEntry[], a: { id: string; decision: "approve" | "reject"; actor: string; comment?: string; now: string }): TuningEntry {
  const versions = replay(log);
  const v = versions.find((x) => x.id === a.id);
  if (!v) throw new Error("no such version");
  if (v.status !== "proposed") throw new Error(`version ${a.id} is already ${v.status}`);
  const comment = (a.comment ?? "").trim().slice(0, 1000);
  if (a.decision === "reject") {
    if (!comment) throw new Error("Rejecting a version needs a comment");
    return appendEntry(head(log), "rejected", a.actor, { id: a.id, comment }, a.now);
  }
  const bad = validateValue(v.target, v.value);
  if (bad.length) throw new Error(`cannot approve: ${bad.join("; ")}`);
  const now = activeOf(versions, v.target).version;
  if (v.base_version !== now) throw new Error(`stale: it was proposed against v${v.base_version} but v${now} has been approved since; propose it again`);
  const unsafe = v.after.questions.tune.unsafe + v.after.questions.holdout.unsafe + v.after.tasks.tune.unsafe + v.after.tasks.holdout.unsafe;
  const unsafeBefore = v.before.questions.tune.unsafe + v.before.questions.holdout.unsafe + v.before.tasks.tune.unsafe + v.before.tasks.holdout.unsafe;
  if (unsafe > unsafeBefore) throw new Error("cannot approve: this version makes the agent answer a question the SOP does not answer, or break a control, more often than the version in use");
  return appendEntry(head(log), "approved", a.actor, { id: a.id, version: v.version, target: v.target, value_sha256: sha(v.value), comment }, a.now);
}

/** A change to the question bank is logged too: who, which ids, and the hash of the bank after. */
export function bankEntry(log: TuningEntry[], a: { actor: string; now: string; change: string; ids: string[]; bank: Question[]; split_changes?: { id: string; from: string; to: string }[] }): TuningEntry {
  return appendEntry(head(log), "bank_edit", a.actor, { change: a.change, ids: a.ids, split_changes: a.split_changes ?? [], bank_sha256: sha(a.bank), size: a.bank.length }, a.now);
}
