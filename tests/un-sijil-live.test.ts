import assert from "node:assert/strict";
import test from "node:test";
import { groupRuns, liveConfigFromEnv, parseBaseUrl, pullLive, SijilLiveError, type LiveConfig, type SijilRecord } from "../src/lib/un/sijil-live.ts";

const uc = { ext_id: "UC01" };
const rec = (seq: number, type: string, task_seq: number | null, extra: Partial<SijilRecord> = {}): SijilRecord => ({ seq, type, task_seq, node_id: "node-a", ...extra });
const cfg: LiveConfig = { baseUrl: "https://sijil.example", token: "secret-token" };

const mockFetch = (verify: unknown, records: SijilRecord[], seen: { url: string; auth?: string }[] = []) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    seen.push({ url: u, auth: (init?.headers as Record<string, string>)?.Authorization });
    const body = u.includes("/api/verify") ? verify : { total: records.length, records };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

test("records group into one run per task_end, actions from counters", () => {
  const recs = [
    rec(1, "task_start", 1), rec(2, "tool_call", 1), rec(3, "tool_call", 1), rec(4, "task_end", 1, { ext: { tool_calls: 7 } }),
    rec(5, "task_start", 5), rec(6, "tool_call", 5), rec(7, "task_end", 5),
    rec(8, "task_start", 8), // unfinished task: no run
  ];
  const runs = groupRuns(recs, uc, "node-a");
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((r) => [r.run_no, r.actions]), [[1, 7], [2, 1]]);
  assert.equal(runs[0].source, "sijil:node-a+simulated-metrics");
  assert.ok(runs[0].accuracy > 0 && runs[0].accuracy <= 1); // simulated metrics filled
});

test("approval rejects are inferred: refused/timeout plus flagged calls without a grant", () => {
  const recs = [
    rec(2, "tool_call", 1, { decision: "flag" }), rec(3, "approval", 1, { ext: { outcome: "granted" } }),
    rec(4, "tool_call", 1, { decision: "flag" }), // needed approval, none granted -> 1
    rec(5, "approval", 1, { ext: { outcome: "refused" } }), // 1
    rec(6, "approval", 1, { ext: { outcome: "timeout" } }), // 1
    rec(7, "task_end", 1),
  ];
  assert.equal(groupRuns(recs, uc, "n")[0].rejects.human_final_approval, 3);
  const clean = [rec(2, "tool_call", 1, { decision: "flag" }), rec(3, "approval", 1, { ext: { outcome: "granted" } }), rec(4, "task_end", 1)];
  assert.equal(groupRuns(clean, uc, "n")[0].rejects.human_final_approval, 0);
});

test("ai_disclosure counts hits of the configured rule only; unset means 0 (not measured)", () => {
  const recs = [rec(2, "inference", 1, { rule_hits: ["no-disclosure", "other"] }), rec(3, "inference", 1, { rule_hits: [{ id: "no-disclosure" }] }), rec(4, "task_end", 1)];
  assert.equal(groupRuns(recs, uc, "n", "no-disclosure")[0].rejects.ai_disclosure, 2);
  assert.equal(groupRuns(recs, uc, "n")[0].rejects.ai_disclosure, 0);
});

test("pullLive verifies first, sends the Bearer token, and returns runs", async () => {
  const seen: { url: string; auth?: string }[] = [];
  const pull = await pullLive(cfg, uc, mockFetch({ ok: true, output: "ok" }, [rec(1, "task_end", 1)], seen));
  assert.equal(pull.verified, true);
  assert.equal(pull.runs.length, 1);
  assert.equal(pull.nodeId, "node-a");
  assert.match(seen[0].url, /\/api\/verify$/);
  assert.equal(seen[0].auth, "Bearer secret-token");
});

test("a failed verification imports nothing and never reaches /api/records", async () => {
  const seen: { url: string }[] = [];
  const pull = await pullLive(cfg, uc, mockFetch({ ok: false, output: "chain broken at seq 9" }, [rec(1, "task_end", 1)], seen));
  assert.equal(pull.verified, false);
  assert.deepEqual(pull.runs, []);
  assert.match(pull.verifyOutput, /broken/);
  assert.equal(seen.length, 1);
});

test("an unreachable node is a clear error, not an empty pass, and leaks no token", async () => {
  const down = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  await assert.rejects(pullLive(cfg, uc, down), (e: Error) => e instanceof SijilLiveError && /unreachable/.test(e.message) && !e.message.includes("secret-token"));
  const bad = (async () => new Response("no", { status: 503 })) as typeof fetch;
  await assert.rejects(pullLive(cfg, uc, bad), /HTTP 503/);
});

test("base URL validation: http(s) only, no creds, no link-local or metadata hosts", () => {
  assert.equal(parseBaseUrl("https://sijil.example/"), "https://sijil.example");
  assert.equal(parseBaseUrl("http://localhost:8000"), "http://localhost:8000");
  for (const u of ["ftp://x.example", "file:///etc/passwd", "not a url", "http://169.254.169.254/", "http://[fe80::1]/", "http://metadata.google.internal/", "https://user:pw@x.example", "http://0.0.0.0:80"])
    assert.throws(() => parseBaseUrl(u), SijilLiveError, u);
  assert.equal(liveConfigFromEnv({}), null);
  assert.equal(liveConfigFromEnv({ SIJIL_BASE_URL: "  " }), null);
  assert.equal(liveConfigFromEnv({ SIJIL_BASE_URL: "https://s.example", SIJIL_API_TOKEN: "t", SIJIL_DISCLOSURE_RULE: "r" })?.disclosureRule, "r");
});
