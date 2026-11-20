import { readFileSync } from "node:fs";
import path from "node:path";
import { loadChunks } from "./kb.ts";
import { DEFAULT_POLICY, parseUseCases, type UnUseCaseState } from "./model.ts";
import { nextStep, startRun, type RunEnv } from "./scenario.ts";
import { SCENARIOS } from "./scenarios.ts";
import { GENESIS, verifyLog } from "./trace.ts";

// Deterministic replays of S1-S4 for the public /replay page and the recorded
// backup (public/replay/backup-run.json). No database, no model call, fictitious
// data only: fixed clock, fixed run ids, the bundled CSV and knowledge base.

export interface ReplayStep {
  step: string;
  outcome: string;
  expected: string;
  match: boolean;
  reasons: string[];
  events: string[];
}
export interface ReplayRun {
  scenario_id: string;
  title: string;
  chain_ok: boolean;
  records: number;
  head_hash: string;
  steps: ReplayStep[];
}
export interface ReplayKit {
  recorded_at: string;
  note: string;
  runs: ReplayRun[];
}

export const REPLAY_AT = "2026-11-19T09:00:00.000Z";
export const BACKUP_PATH = "public/replay/backup-run.json";

export async function buildReplays(root = process.cwd()): Promise<ReplayKit> {
  const env: RunEnv = { now: () => REPLAY_AT, chunks: loadChunks() };
  const cases: UnUseCaseState[] = parseUseCases(readFileSync(path.join(root, "data/un-use-cases.csv"), "utf8")).useCases.map((u, i) => ({
    ...u, id: `replay-${i + 1}`, stage: "intake", verdict: null, compliant: false,
  }));
  const runs: ReplayRun[] = [];
  for (const sc of Object.values(SCENARIOS)) {
    let run = startRun(sc, `${sc.id}-replay`, sc.kind === "portfolio" ? { cases, policy: DEFAULT_POLICY } : {});
    while (!run.done) run = await nextStep(sc, run, env);
    runs.push({
      scenario_id: sc.id,
      title: sc.title,
      chain_ok: verifyLog(run.log).ok,
      records: run.log.length,
      head_hash: run.log.length ? run.log[run.log.length - 1].hash : GENESIS,
      steps: run.steps.map((s) => ({ step: s.step, outcome: s.outcome, expected: s.expected, match: s.match, reasons: s.reasons, events: s.events.map((e) => e.summary) })),
    });
  }
  return { recorded_at: REPLAY_AT, note: "Synthetic data. Deterministic replay: no database, no model call.", runs };
}

/** The recorded backup when present, else a fresh deterministic build. */
export async function loadReplays(root = process.cwd()): Promise<ReplayKit> {
  try {
    return JSON.parse(readFileSync(path.join(root, BACKUP_PATH), "utf8")) as ReplayKit;
  } catch {
    return buildReplays(root);
  }
}
