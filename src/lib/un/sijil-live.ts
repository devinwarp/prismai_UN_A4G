import { simulatedSijil, type Criterion, type SijilRun } from "./sijil.ts";
import type { UnUseCaseState } from "./model.ts";

// Optional live adapter. Sijil is a separate product under its own licence;
// this file only calls its read-only HTTP API (/api/records, /api/verify) and
// shares no code with it. Set SIJIL_BASE_URL to enable; unset means simulated.
//
// What Sijil attests: the hash-chained record log, tool calls, approvals and
// policy decisions. What it does NOT measure: accuracy, hallucination, goal
// alignment. Those three stay SIMULATED and every run says so in `source`.

export class SijilLiveError extends Error {}

export interface LiveConfig {
  baseUrl: string;
  token?: string;
  /** Policy rule id whose hits count as ai_disclosure rejects. Unset = not measured. */
  disclosureRule?: string;
}

const TIMEOUT_MS = 5000;
const PAGE = 1000;
const MAX_PAGES = 50;

/** http(s) only, no credentials in the URL, no link-local / metadata hosts. */
export function parseBaseUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new SijilLiveError("SIJIL_BASE_URL is not a valid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new SijilLiveError("SIJIL_BASE_URL must be http(s)");
  if (u.username || u.password) throw new SijilLiveError("SIJIL_BASE_URL must not contain credentials");
  const h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const blocked =
    /^169\.254\./.test(h) || // link-local, cloud metadata
    /^(fe[89ab][0-9a-f]?:|fd00:ec2:)/.test(h) || // IPv6 link-local, AWS IPv6 metadata
    /^::ffff:169\.254\./.test(h) ||
    h === "0.0.0.0" || h === "metadata.google.internal" || h === "metadata" || h === "100.100.100.200";
  if (blocked) throw new SijilLiveError("SIJIL_BASE_URL points at a link-local or metadata address");
  return u.origin + u.pathname.replace(/\/+$/, "");
}

/** null when SIJIL_BASE_URL is unset (simulated); throws on an invalid value. */
export function liveConfigFromEnv(env: Record<string, string | undefined> = process.env): LiveConfig | null {
  const raw = env.SIJIL_BASE_URL?.trim();
  if (!raw) return null;
  return { baseUrl: parseBaseUrl(raw), token: env.SIJIL_API_TOKEN?.trim() || undefined, disclosureRule: env.SIJIL_DISCLOSURE_RULE?.trim() || undefined };
}

type Fetch = typeof fetch;

async function getJson(cfg: LiveConfig, path: string, f: Fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await f(cfg.baseUrl + path, {
      headers: { Accept: "application/json", ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
      cache: "no-store",
    });
  } catch (e) {
    // Never include headers or the token in the message.
    const why = e instanceof Error && e.name === "TimeoutError" ? "timed out" : "unreachable";
    throw new SijilLiveError(`Sijil node ${why} (${new URL(cfg.baseUrl).host})`);
  }
  if (!res.ok) throw new SijilLiveError(`Sijil node returned HTTP ${res.status} for ${path.split("?")[0]}`);
  try { return await res.json(); } catch { throw new SijilLiveError(`Sijil node returned invalid JSON for ${path.split("?")[0]}`); }
}

export interface SijilRecord {
  seq: number;
  type: string;
  node_id?: string;
  decision?: string;
  rule_hits?: unknown;
  task_seq?: number | null;
  ext?: Record<string, unknown> | null;
}

export interface LivePull {
  verified: boolean;
  verifyOutput: string;
  nodeId: string;
  /** Whether ai_disclosure rejects are measured (a rule id was configured). */
  disclosureMeasured: boolean;
  records: number;
  runs: SijilRun[];
}

const hitIds = (h: unknown): string[] =>
  (Array.isArray(h) ? h : []).map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>).id ?? (x as Record<string, unknown>).rule ?? "") : ""));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** One run per task_end, grouped by task_seq. Pure; exported for tests. */
export function groupRuns(records: SijilRecord[], uc: Pick<UnUseCaseState, "ext_id">, nodeId: string, disclosureRule?: string): SijilRun[] {
  const byTask = new Map<number, SijilRecord[]>();
  for (const r of records) if (r.task_seq != null) byTask.set(r.task_seq, [...(byTask.get(r.task_seq) ?? []), r]);
  const ends = records.filter((r) => r.type === "task_end").sort((a, b) => a.seq - b.seq);
  return ends.map((end, i) => {
    const key = end.task_seq ?? end.seq;
    const group = byTask.get(key) ?? [end];
    const calls = group.filter((r) => r.type === "tool_call");
    const approvals = group.filter((r) => r.type === "approval");
    const granted = approvals.filter((r) => r.ext?.outcome === "granted").length;
    const refused = approvals.filter((r) => r.ext?.outcome === "refused" || r.ext?.outcome === "timeout").length;
    // INFERRED: a flagged tool call is one that needed a human; any beyond the
    // granted approvals ran (or was attempted) without a human release.
    const needed = calls.filter((r) => r.decision === "flag").length;
    const unreleased = Math.max(0, needed - granted);
    const actions = Math.max(1, num(end.ext?.tool_calls) ?? (calls.length || group.length));
    const sim = simulatedSijil.runs(uc, "healthy", i + 1, 1)[0]; // accuracy, hallucination, goal alignment are NOT Sijil measures
    const rejects: Record<Criterion, number> = { ...sim.rejects, human_final_approval: refused + unreleased, ai_disclosure: 0 };
    if (disclosureRule) rejects.ai_disclosure = group.filter((r) => hitIds(r.rule_hits).includes(disclosureRule)).length;
    const run_no = i + 1;
    return {
      run_no, source: `sijil:${nodeId}+simulated-metrics`, actions,
      accuracy: sim.accuracy, hallucination_rate: sim.hallucination_rate, goal_alignment: sim.goal_alignment,
      rejects,
    };
  });
}

/** Verify the chain first, then pull and group records. Throws SijilLiveError
 * when the node is unreachable; a failed verification is returned, not thrown,
 * so the caller can show it. */
export async function pullLive(cfg: LiveConfig, uc: Pick<UnUseCaseState, "ext_id">, f: Fetch = fetch): Promise<LivePull> {
  const v = (await getJson(cfg, "/api/verify", f)) as { ok?: unknown; output?: unknown };
  const verified = v?.ok === true;
  const verifyOutput = String(v?.output ?? "").slice(0, 500);
  if (!verified) return { verified, verifyOutput, nodeId: "unknown", disclosureMeasured: Boolean(cfg.disclosureRule), records: 0, runs: [] };

  const records: SijilRecord[] = [];
  let after = 0;
  for (let p = 0; p < MAX_PAGES; p++) {
    const page = (await getJson(cfg, `/api/records?after=${after}&limit=${PAGE}`, f)) as { records?: SijilRecord[] };
    const rs = Array.isArray(page?.records) ? page.records : [];
    records.push(...rs);
    if (rs.length < PAGE) break;
    after = rs[rs.length - 1].seq;
  }
  const nodeId = String(records.find((r) => r.node_id)?.node_id ?? "unknown").replace(/[^\w.-]/g, "").slice(0, 40) || "unknown";
  return { verified, verifyOutput, nodeId, disclosureMeasured: Boolean(cfg.disclosureRule), records: records.length, runs: groupRuns(records, uc, nodeId, cfg.disclosureRule) };
}

export const liveLabel = (nodeId: string) => `Sijil live node ${nodeId} (chain verified; accuracy, hallucination and goal alignment simulated)`;

/** Node id from runs pulled live, else null (simulated). */
export const liveNode = (runs: Pick<SijilRun, "source">[]): string | null => {
  const s = runs.find((r) => r.source.startsWith("sijil:"))?.source;
  return s ? s.slice(6).replace(/\+simulated-metrics$/, "") : null;
};
