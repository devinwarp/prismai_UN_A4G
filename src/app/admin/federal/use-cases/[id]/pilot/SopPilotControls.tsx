"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { roundScore } from "@/lib/un/sop-pilot-score";
import type { SopPilotJob, SopPilotResult, SopPilotRound } from "@/lib/un/sop-pilot";
import { btnGhost, btnPrimary, card, field, scrollFocus } from "../../../_components/ui";

// One screen for the whole SOP pilot: run the approved tests, watch the tuning loop (tests, then the tuning agent reads the failures and writes guidance, then the
// SAME tests rerun with that guidance), and certify, which records the pilot report the journey and the release gate read. The server drives a run: this screen only
// shows it, and steps the run itself only when the server has gone quiet.

const STALE_MS = 25_000;
const POLL_MS = 2_000;

const CHECK_WORDS: Record<string, string> = {
  response_format: "The model did not return the required structure",
  citations: "It cited a passage that was not supplied, or cited nothing",
  human_review: "It was not marked as a draft for a person to review",
  outcome: "The output did not match the expected result",
  sijil_block: "Sijil blocked a request that should have been answered",
  tool_allowlist: "It asked for a tool that is not on this job profile's allow-list",
};
const checkWord = (check: string) => CHECK_WORDS[check] ?? `Expected ${check.replace(/^output\./, "")} did not hold`;

const usd = (v: number | null | undefined) => (v == null ? "not priced" : `$${v.toFixed(v < 1 ? 4 : 2)}`);
const duration = (ms: number) => (ms < 1000 ? "0s" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);
const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "0%");

type Delivery = { job: SopPilotJob | null; jobs?: SopPilotJob[]; limits?: { run: number; day: number }; dayCalls?: number | null; busy?: boolean; error?: string };

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} className="h-2.5 w-full overflow-hidden rounded-full bg-track">
      <div className="h-full rounded-full bg-lit transition-[width] duration-300 motion-reduce:transition-none" style={{ width: max ? `${Math.min(100, (100 * value) / max)}%` : "0%" }} />
    </div>
  );
}

function statusWord(job: SopPilotJob) {
  switch (job.status) {
    case "running": return job.mode === "certify" ? "Certifying" : job.mode === "pilot" ? "Running the baseline" : "Tuning";
    case "target_reached": return "95% target reached";
    case "round_limit": return job.mode === "pilot" ? "Baseline complete" : "Round limit reached";
    case "certified": return job.report ? (job.report.conclusive && job.report.failed.length === 0 ? "Report recorded: thresholds met" : "Report recorded: thresholds not met") : "Report recorded";
    case "budget": return "Stopped at the spend limit";
    case "stopped": return "Stopped";
    default: return "Run interrupted";
  }
}

/** What the run is doing right now, in words. */
function doingNow(job: SopPilotJob): string {
  const round = job.rounds.at(-1)!;
  const done = round.results.length;
  if (job.mode === "certify") return `Certifying: test run ${Math.min(done + 1, job.caseCount)} of ${job.caseCount} (${job.reps ?? 1} runs of each test)`;
  if (job.mode === "tune" && roundScore(round, job.caseCount).complete) return `The tuning agent is reading the failed checks of round ${job.rounds.length} and writing guidance for round ${job.rounds.length + 1}`;
  return `Round ${job.rounds.length}${round.tuning ? " (with the tuning agent's guidance)" : round.instructions ? " (with the best guidance so far)" : " (the skill alone)"}: test ${Math.min(done + 1, job.caseCount)} of ${job.caseCount}`;
}

function Outcome({ r }: { r: SopPilotResult }) {
  if (r.status === "error") return <span>⚠ Unavailable</span>;
  if (r.status === "blocked_by_sijil") return <span>{r.passed ? "✓ Blocked as expected" : "✕ Blocked, not expected"}</span>;
  return r.passed ? <span className="text-lit-deep">✓ Passed</span> : <span className="text-ember">✕ Failed</span>;
}

function Results({ round, job, label }: { round: SopPilotRound; job: SopPilotJob; label: string }) {
  if (!round.results.length) return null;
  return (
    <div className="mt-3 overflow-x-auto" role="region" aria-label={label} {...scrollFocus}>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-ink-soft"><th scope="col" className="py-1 pe-3 text-start font-normal">Test</th><th scope="col" className="py-1 pe-3 text-start font-normal">Result</th><th scope="col" className="py-1 text-start font-normal">Why</th></tr></thead>
        <tbody>
          {round.results.map((t, i) => {
            const title = job.cases?.find((c) => c.id === t.id)?.title ?? t.title;
            return (
              <tr key={`${t.id}-${t.rep ?? 1}-${i}`} className="border-t border-line align-top">
                <th scope="row" className="max-w-[28ch] py-2 pe-3 text-start font-normal">{title}{(t.rep ?? 1) > 1 || job.mode === "certify" ? <span className="text-xs text-ink-soft"> · run {t.rep ?? 1}</span> : null}</th>
                <td className="py-2 pe-3 whitespace-nowrap"><Outcome r={t} /></td>
                <td className="max-w-[56ch] py-2 break-words">
                  {t.passed && !t.sijil && t.status !== "blocked_by_sijil" ? <span className="text-ink-soft">All checks held{t.ms ? ` · ${duration(t.ms)}` : ""}</span> : null}
                  {t.status === "blocked_by_sijil" && <p className="text-ink-soft">{t.sijil?.source === "node" ? "Sijil node" : "Authority check (simulated)"}{t.sijil?.seq ? ` · record ${t.sijil.seq}` : ""}{t.sijil?.rules.length ? ` · ${t.sijil.rules.join(", ")}` : ""}</p>}
                  {!t.passed && t.failedChecks.length > 0 && <ul className="list-disc ps-4">{[...new Set(t.failedChecks)].map((c) => <li key={c}>{checkWord(c)}</li>)}</ul>}
                  {!t.passed && t.differences.length > 0 && <ul className="list-disc ps-4 text-xs text-ink-soft">{t.differences.map((d, k) => <li key={k}>{d}</li>)}</ul>}
                  {t.output && <details className="mt-1"><summary className="cursor-pointer text-xs underline">Actual output</summary><pre className="mt-1 whitespace-pre-wrap break-all text-xs">{JSON.stringify(t.output, null, 2)}</pre></details>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The loop: round, tuning agent, round with its guidance, and so on. */
function Loop({ job, running }: { job: SopPilotJob; running: boolean }) {
  const best = job.rounds.length ? job.rounds.reduce<{ i: number; n: number } | null>((b, r, i) => {
    const s = roundScore(r, job.caseCount);
    return s.complete && (!b || s.passed > b.n) ? { i, n: s.passed } : b;
  }, null) : null;
  return (
    <ol className="mt-4 space-y-0" aria-label="The tuning loop">
      {job.rounds.map((round, i) => {
        const score = roundScore(round, job.caseCount);
        const prev = i > 0 ? roundScore(job.rounds[i - 1], job.caseCount) : null;
        const delta = prev && score.complete && prev.complete ? score.passed - prev.passed : null;
        const last = i === job.rounds.length - 1;
        const open = last || undefined;
        return (
          <li key={i}>
            {round.tuning && (
              <div className="ms-3 border-s-2 border-line ps-4 py-3">
                <p className="text-sm font-medium">Tuning agent</p>
                <p className="mt-1 text-sm">It was shown the failed checks of round {i}:{" "}
                  {round.tuning.saw.length ? round.tuning.saw.map((s, k) => <span key={k}>{k > 0 ? "; " : ""}<span className="font-medium">{s.task}</span> ({s.checks.map(checkWord).join(", ")})</span>) : "none"}.
                </p>
                {round.tuning.reason && <p className="mt-1 text-sm"><span className="font-medium">Why this guidance:</span> {round.tuning.reason}</p>}
                <details className="mt-1 text-sm"><summary className="cursor-pointer underline">The guidance it wrote</summary><p className="mt-1 whitespace-pre-wrap break-words">{round.instructions}</p></details>
                <p className="mt-2 text-sm text-ink-soft" aria-hidden="true">↓ rerun the same {job.caseCount} tests with this guidance</p>
              </div>
            )}
            <details className="rounded-lg border border-line px-3 py-2" open={open}>
              <summary className="cursor-pointer text-sm font-medium">
                Round {i + 1} · {i === 0 ? (round.instructions ? "best guidance so far" : "the skill alone") : "with the tuning agent's guidance"}
                {" · "}{score.complete ? `${score.passed} of ${job.caseCount} passed (${pct(score.passed, job.caseCount)})` : `${round.results.length} of ${job.caseCount} run`}
                {delta !== null && delta !== 0 ? ` · ${delta > 0 ? "↑ +" : "↓ "}${delta} since round ${i}` : delta === 0 ? ` · no change since round ${i}` : ""}
                {best && best.i === i && job.mode !== "pilot" && score.complete ? " · best so far" : ""}
                {score.hardFailure ? " · a hard check failed" : ""}
                {last && running && !score.complete ? " · running" : ""}
              </summary>
              <Results round={round} job={job} label={`Round ${i + 1} results`} />
            </details>
          </li>
        );
      })}
    </ol>
  );
}

export function SopPilotControls({ useCaseId, profile, mayRun, mayTune }: { useCaseId: string; profile: string; mayRun: boolean; mayTune: boolean }) {
  const url = `/api/admin/un/use-cases/${useCaseId}/pilot/sop`;
  const router = useRouter();
  const [data, setData] = useState<Delivery>({ job: null });
  const [rounds, setRounds] = useState(5);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  // the time of the last poll, so that "has the server gone quiet" is not computed from the clock during render
  const [clock, setClock] = useState<number | null>(null);
  const [error, setError] = useState("");
  const stepping = useRef(false);
  const lastStatus = useRef<string | null>(null);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, profile }) });
    const body = (await response.json().catch(() => ({}))) as Delivery;
    if (!response.ok) throw new Error(body.error || "The Pilot request could not complete.");
    return body;
  }, [url, profile]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${url}?profile=${encodeURIComponent(profile)}`);
      const body = (await response.json()) as Delivery;
      if (!response.ok) throw new Error(body.error || "Could not load the Pilot.");
      setData(body);
      setError("");
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the Pilot.");
      return null;
    } finally { setLoaded(true); }
  }, [url, profile]);

  // the first load: a plain fetch chain, so state is set from its callbacks and not from the effect body
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${url}?profile=${encodeURIComponent(profile)}`, { signal: controller.signal })
      .then(async (response) => ({ ok: response.ok, body: (await response.json()) as Delivery }))
      .then(({ ok, body }) => {
        if (controller.signal.aborted) return;
        if (!ok) throw new Error(body.error || "Could not load the Pilot.");
        setData(body);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load the Pilot."); })
      .finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, [url, profile]);

  const job = data.job;
  const running = job?.status === "running";

  // while a run is going: watch it, and step it from here only if the server has stopped advancing it
  useEffect(() => {
    if (!running || !job) return;
    const timer = setInterval(async () => {
      setClock(Date.now());
      const body = await load();
      const j = body?.job;
      if (!j || j.status !== "running" || stepping.current) return;
      if (Date.now() - Date.parse(j.updatedAt ?? j.startedAt) > STALE_MS) {
        stepping.current = true;
        try { setData(await call({ action: "step", job_id: j.id })); } catch (err) { setError(err instanceof Error ? err.message : "The step could not complete."); }
        finally { stepping.current = false; }
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, job, load, call]);

  // a run that has just ended: refresh the page so the recorded report and the goal review appear below
  useEffect(() => {
    const now = job?.status ?? null;
    if (lastStatus.current === "running" && now && now !== "running" && job?.reportId) router.refresh();
    lastStatus.current = now;
  }, [job?.status, job?.reportId, router]);

  async function start(mode: SopPilotJob["mode"]) {
    setBusy(true); setError("");
    try { setData(await call({ action: "start", mode, rounds })); } catch (err) { setError(err instanceof Error ? err.message : "The run could not start."); }
    finally { setBusy(false); }
  }
  async function resume() {
    if (!job) return;
    setBusy(true); setError("");
    try { setData(await call({ action: "drive", job_id: job.id })); } catch (err) { setError(err instanceof Error ? err.message : "The run could not resume."); }
    finally { setBusy(false); }
  }
  async function stop() {
    if (!job) return;
    setBusy(true); setError("");
    try { setData(await call({ action: "stop", job_id: job.id })); } catch (err) { setError(err instanceof Error ? err.message : "The run could not be stopped."); }
    finally { setBusy(false); }
  }

  const jobs = data.jobs ?? (job ? [job] : []);
  const loopJob = running && job && job.mode !== "certify" ? job : jobs.find((j) => j.mode !== "certify") ?? null;
  const certJob = jobs.find((j) => j.mode === "certify") ?? null;
  const limits = data.limits ?? job?.limits ?? { run: 200, day: 600 };
  const round = job?.rounds.at(-1);
  const stale = !!job && running && clock !== null && clock - Date.parse(job.updatedAt ?? job.startedAt) > STALE_MS;
  const canControl = job?.mode === "tune" ? mayTune : mayRun;
  const finished = !!loopJob && loopJob.status !== "running";

  return (
    <section className={`${card} mt-6`} aria-labelledby="sop-pilot">
      <h2 id="sop-pilot" className="font-display text-2xl font-medium">Pilot, tuning and report</h2>
      <p className="mt-2 max-w-[72ch] text-sm text-ink-soft">
        The approved tests run against this job profile. If some fail, the tuning agent reads which checks failed, writes supplemental guidance, and the same tests run again; this repeats until 95% pass or the rounds run out.
        Certify then runs every test several times with the best guidance and records the pilot report that the journey, the release gate and the goal review read. The run continues on the server if you close this page.
      </p>

      {error && <p role="alert" className="mt-3 text-sm text-ember">✕ {error}</p>}
      {!loaded && <p className="mt-3 text-sm text-ink-soft" role="status">Loading the Pilot…</p>}
      {job?.exempt && <p role="note" className="mt-3 rounded-lg border border-line bg-paper-deep px-3 py-2 text-sm"><span className="font-medium">Ran out of the usual order.</span> {job.exempt}</p>}

      {loaded && (mayRun || mayTune) && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {running ? (
            <>
              {canControl && <button type="button" className={btnGhost} disabled={busy} onClick={() => void stop()}>Stop the run</button>}
              {canControl && stale && <button type="button" className={btnPrimary} disabled={busy} onClick={() => void resume()}>Resume on the server</button>}
            </>
          ) : (
            <>
              {mayRun && <button type="button" className={btnGhost} disabled={busy} onClick={() => void start("pilot")}>1. Run the baseline</button>}
              {mayTune && (
                <>
                  <label className="grid gap-1 text-sm">Most rounds
                    <input className={`${field} w-24`} type="number" min={1} max={12} step={1} value={rounds || ""} disabled={busy} onChange={(e) => setRounds(Number(e.target.value))} />
                  </label>
                  <button type="button" className={btnPrimary} disabled={busy || rounds < 1 || rounds > 12 || !Number.isInteger(rounds)} onClick={() => void start("tune")}>2. Tune and rerun</button>
                </>
              )}
              {mayRun && <button type="button" className={btnGhost} disabled={busy} onClick={() => void start("certify")}>3. Certify and record the report</button>}
            </>
          )}
        </div>
      )}

      {job && (
        <div className="mt-5 border-t border-line pt-4" aria-live="polite">
          <p className="text-sm font-medium" role="status">{statusWord(job)}</p>
          {running && <p className="mt-1 text-sm" data-testid="doing-now">{doingNow(job)}{stale ? " · waiting for the server to continue" : ""}</p>}
          {round && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-ink-soft">{job.mode === "certify" ? "Test runs completed" : `Round ${job.rounds.length}: tests completed`} · {round.results.length} of {job.caseCount}</p>
                <Bar value={round.results.length} max={job.caseCount} label="Tests completed in the current round" />
              </div>
              {job.mode === "tune" && (
                <div>
                  <p className="mb-1 text-xs text-ink-soft">Rounds used · {job.rounds.length} of up to {job.limit}</p>
                  <Bar value={job.rounds.length - (running && !roundScore(round, job.caseCount).complete ? 1 : 0)} max={job.limit} label="Tuning rounds used" />
                </div>
              )}
            </div>
          )}
          {running && job.cases && round && job.mode !== "certify" && !roundScore(round, job.caseCount).complete && (
            <p className="mt-2 text-xs text-ink-soft">Running now: {job.cases.slice(round.results.length, round.results.length + 3).map((c) => c.title).join(" · ")}</p>
          )}
          <p className="mt-3 text-xs text-ink-soft tabular-nums">
            Model calls this run: {job.calls ?? 0} of {limits.run} · today for this use case: {data.dayCalls ?? "?"} of {limits.day} · time working: {duration(job.elapsedMs ?? 0)} · cost: {usd(job.costUsd)} · {job.model}
          </p>
          {job.message && job.status !== "running" && <p className="mt-2 text-sm" role={job.status === "error" || job.status === "budget" ? "alert" : undefined}>{job.status === "error" || job.status === "budget" ? "✕ " : ""}{job.message}</p>}
        </div>
      )}

      {loopJob && loopJob.rounds.length > 0 && (
        <div className="mt-4">
          <h3 className="text-base font-medium">{loopJob.mode === "pilot" ? "Baseline" : "The tuning loop"}</h3>
          {finished && <p className="mt-1 text-sm text-ink-soft">{statusWord(loopJob)}. {loopJob.mode === "tune" || loopJob.mode === "pilot" ? "When you are happy with the guidance, certify it to record the report." : ""}</p>}
          <Loop job={loopJob} running={running && loopJob.id === job?.id} />
        </div>
      )}

      {certJob && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="text-base font-medium">Certify and record the report</h3>
          <p className="mt-1 text-sm">{statusWord(certJob)}{certJob.status === "running" ? ` · ${certJob.rounds[0].results.length} of ${certJob.caseCount} test runs` : ""}</p>
          {certJob.report && (
            <div className="mt-2 text-sm">
              <p>{certJob.report.conclusive ? "Conclusive" : "Not conclusive"} · verdict {certJob.report.verdict}{certJob.report.failed.length ? ` · thresholds failing: ${certJob.report.failed.join(", ")}` : " · no threshold failing"}</p>
              {certJob.report.insufficient.length > 0 && <ul className="mt-1 list-disc ps-5 text-ink-soft">{certJob.report.insufficient.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              <p className="mt-2 text-ink-soft">The report is saved. Goal alignment is measured when a person approves the goal judgments below; until then it reads as not measured.</p>
              <p className="mt-1"><a className="underline" href="#pi-last">Open the report and the goal review</a></p>
            </div>
          )}
          {certJob.rounds[0] && certJob.rounds[0].results.length > 0 && (
            <details className="mt-2"><summary className="cursor-pointer text-sm underline">Every test run ({certJob.rounds[0].results.length})</summary><Results round={certJob.rounds[0]} job={certJob} label="Certify results" /></details>
          )}
          <p className="mt-2 text-xs text-ink-soft tabular-nums">Calls {certJob.calls ?? 0} · time working {duration(certJob.elapsedMs ?? 0)} · cost {usd(certJob.costUsd)}</p>
        </div>
      )}

      {loaded && !job && !error && <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">No Pilot run recorded for this profile yet. Spend limits: {limits.run} model calls per run and {limits.day} per day for this use case.</p>}
    </section>
  );
}
