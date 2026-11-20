import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chainHashes, firstBroken } from "../src/lib/un/landing/chain.ts";
import { COPY } from "../src/lib/un/landing/copy.ts";
import { allowJudgeAttempt, judgeCredentials, judgeLoginAvailable } from "../src/lib/un/judge-login.ts";

// proxy.ts uses a path alias node cannot resolve, so read the matcher out of the source.
const source = JSON.parse(readFileSync("src/proxy.ts", "utf8").match(/matcher: \[\s*(".*"),?\s*\]/)![1].replace(/\\\\/g, "\\\\"));
const matcher = new RegExp(`^${source}$`);
const proxied = (p: string) => matcher.test(p);

test("proxy skips the landing page, replay and the judge route; still runs for login and admin", () => {
  for (const p of ["/", "/replay", "/replay/backup-run.json", "/api/judge-login"]) assert.equal(proxied(p), false, p);
  for (const p of ["/login", "/admin/federal", "/api/admin/un/runs"]) assert.equal(proxied(p), true, p);
});

test("only /admin needs a session in the middleware (so / and /login are public)", () => {
  const src = readFileSync("src/lib/supabase/middleware.ts", "utf8");
  assert.match(src, /needsAuth = path\.startsWith\("\/admin"\)/);
});

test("judge login is off without env, on with it, and never exposes the password", () => {
  const keep = { ...process.env };
  const env = process.env as Record<string, string | undefined>;
  try {
    delete process.env.OFFLINE;
    env.NODE_ENV = "production";
    delete process.env.JUDGE_LOGIN_EMAIL;
    delete process.env.JUDGE_LOGIN_PASSWORD;
    assert.equal(judgeCredentials(), null);
    assert.equal(judgeLoginAvailable(), false);
    process.env.JUDGE_LOGIN_EMAIL = "j@example.invalid";
    assert.equal(judgeLoginAvailable(), false, "needs both");
    process.env.JUDGE_LOGIN_PASSWORD = "s3cret-value";
    assert.equal(judgeLoginAvailable(), true);
  } finally {
    for (const k of ["OFFLINE", "NODE_ENV", "JUDGE_LOGIN_EMAIL", "JUDGE_LOGIN_PASSWORD"]) {
      if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k];
    }
  }
  // Client code and the route's responses must not reference the secrets.
  for (const f of ["src/components/landing/Landing.tsx", "src/app/login/LoginClient.tsx", "src/app/login/page.tsx", "src/app/page.tsx"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /JUDGE_LOGIN_(EMAIL|PASSWORD)|judgeCredentials/, f);
  }
  const route = readFileSync("src/app/api/judge-login/route.ts", "utf8");
  assert.doesNotMatch(route, /(NextResponse|Response)[^;]*creds\.(email|password)/);
  assert.match(route, /status: 404/);
});

test("judge attempts are rate limited per client", () => {
  const t = 1_000_000;
  for (let i = 0; i < 8; i++) assert.equal(allowJudgeAttempt("a", t + i), true);
  assert.equal(allowJudgeAttempt("a", t + 9), false);
  assert.equal(allowJudgeAttempt("b", t + 9), true);
  assert.equal(allowJudgeAttempt("a", t + 61_000), true);
});

test("logbook chain: editing one record breaks it and every later one, not earlier ones", async () => {
  const recs = COPY.en.records;
  const sealed = await chainHashes(recs);
  assert.equal(sealed[0].length, 64);
  assert.equal(firstBroken(sealed, await chainHashes(recs)), -1);
  const edited = recs.map((r, i) => (i === 2 ? r.replace(COPY.en.tamperFrom, COPY.en.tamperTo) : r));
  assert.notEqual(edited[2], recs[2]);
  const live = await chainHashes(edited);
  assert.equal(firstBroken(sealed, live), 2);
  assert.deepEqual(live.map((h, i) => h === sealed[i]), [true, true, false, false, false, false]);
  const ar = COPY.ar.records.map((r, i) => (i === 2 ? r.replace(COPY.ar.tamperFrom, COPY.ar.tamperTo) : r));
  assert.notEqual(ar[2], COPY.ar.records[2]);
});

test("landing numbers match the evaluation files and README, and the banned name is absent", () => {
  const res = readFileSync("docs/eval/agent-results.md", "utf8");
  assert.equal((res.match(/100\.0% \(20\/20\)/g) ?? []).length, 3);
  const cites = [...res.matchAll(/\| Citation validity[^\n]*/g)][0][0];
  const sum = [...cites.matchAll(/\((\d+)\/\d+\)/g)].reduce((n, m) => n + Number(m[1]), 0);
  assert.equal(sum, 930);
  const before = readFileSync("docs/eval/agent-results-before-guard.md", "utf8");
  assert.match(before, /\| Path match \| 100% \(20\/20\).*0% \(0\/20\).*35% \(7\/20\)/);
  assert.match(readFileSync("README.md", "utf8"), /32 sources, 398 chunks/);
  assert.equal(COPY.en.proof.length, COPY.ar.proof.length);
  assert.equal(COPY.en.records.length, 6);
});
