"use client";

import { useEffect, useRef, useState } from "react";
import type { SopPilotJob } from "@/lib/un/sop-pilot";
import { btnGhost, btnPrimary, card, field, scrollFocus } from "../../../_components/ui";

function statusOf(job: SopPilotJob) {
  if (job.status === "target_reached") return "95% target reached";
  if (job.status === "round_limit") return job.mode === "pilot" ? "Pilot complete" : "Round limit reached";
  if (job.status === "stopped") return "Stopped";
  if (job.status === "error") return "Run interrupted";
  return job.mode === "pilot" ? "Running pilot" : "Tuning";
}

export function SopPilotControls({ useCaseId, profile, mayRun, mayTune }: {
  useCaseId: string; profile: string; mayRun: boolean; mayTune: boolean;
}) {
  const url = `/api/admin/un/use-cases/${useCaseId}/pilot/sop`;
  const [job, setJob] = useState<SopPilotJob | null>(null);
  const [rounds, setRounds] = useState(5);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const driver = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${url}?profile=${encodeURIComponent(profile)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the Pilot.");
        if (!controller.signal.aborted) setJob(data.job);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load the Pilot."); })
      .finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => { controller.abort(); driver.current?.abort(); };
  }, [profile, url]);

  async function action(payload: Record<string, unknown>, signal?: AbortSignal): Promise<{ job: SopPilotJob | null; busy?: boolean }> {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, profile }), signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The Pilot request could not complete.");
    return data;
  }

  async function drive(mode?: SopPilotJob["mode"]) {
    if (driver.current) return;
    const controller = new AbortController();
    driver.current = controller;
    const { signal } = controller;
    setBusy(true);
    setError("");
    try {
      let current = mode ? (await action({ action: "start", mode, rounds }, signal)).job : job;
      if (signal.aborted) return;
      setJob(current);
      while (!signal.aborted && current?.status === "running") {
        const updated = await action({ action: "step", job_id: current.id }, signal);
        if (signal.aborted) break;
        current = updated.job;
        setJob(current);
        if (updated.busy) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (err) {
      if (!signal.aborted) setError(err instanceof Error ? err.message : "The run is saved and can be resumed.");
    } finally {
      if (driver.current === controller) { driver.current = null; setBusy(false); }
    }
  }

  async function stop() {
    if (!job || stopping) return;
    setStopping(true);
    setError("");
    try {
      const stopped = await action({ action: "stop", job_id: job.id });
      driver.current?.abort();
      setJob(stopped.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Pilot could not be stopped.");
    } finally { setStopping(false); }
  }

  const active = job?.status === "running";
  const canControl = job?.mode === "tune" ? mayTune : mayRun;
  const latest = job?.rounds.at(-1);

  return (
    <section className={`${card} mt-6`} aria-labelledby="sop-pilot">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="sop-pilot" className="font-display text-2xl font-medium">Pilot and automatic tuning</h2>
        <span className="text-sm font-medium">95% test pass target</span>
      </div>
      <p className="mt-2 max-w-[70ch] text-sm text-ink-soft">Run the approved Testgen cases against this profile. Automatic tuning revises the agent instructions and reruns the same tests. Keep this page open to advance the run. You can reopen it and resume from the latest saved batch.</p>
      {error && <p role="alert" className="mt-3 text-sm text-ember">{error} {!job && <button type="button" className="underline" onClick={() => window.location.reload()}>Reload</button>}</p>}
      {!loaded && <p className="mt-3 text-sm text-ink-soft" role="status">Loading Pilot…</p>}

      {loaded && (mayRun || mayTune) && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {active && canControl && (
            <>
              {!busy && <button type="button" className={btnPrimary} disabled={stopping} onClick={() => void drive()}>Resume run</button>}
              <button type="button" className={btnGhost} disabled={stopping} onClick={() => void stop()}>{stopping ? "Stopping…" : "Stop run"}</button>
            </>
          )}
          {!active && mayRun && <button type="button" className={btnGhost} disabled={busy || (!!error && !job)} onClick={() => void drive("pilot")}>Run baseline pilot</button>}
          {!active && mayTune && (
            <>
              <label className="grid gap-1 text-sm">Maximum rounds
                <input className={`${field} w-28`} type="number" min={1} max={12} step={1} value={rounds || ""} disabled={busy} onChange={(event) => setRounds(Number(event.target.value))} />
              </label>
              <button type="button" className={btnPrimary} disabled={busy || rounds < 1 || rounds > 12 || !Number.isInteger(rounds) || (!!error && !job)} onClick={() => void drive("tune")}>Start automatic tuning</button>
            </>
          )}
        </div>
      )}

      {!job && loaded && !error && <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">No Pilot runs recorded for this profile.</p>}
      {job && latest && (
        <div className="mt-5 border-t border-line pt-4">
          <p role="status" className="text-sm font-medium">{statusOf(job)} · Round {job.rounds.length} of {job.limit} · {latest.results.length} of {job.caseCount} tests complete</p>
          <progress className="mt-2 h-2 w-full accent-pine" aria-label="Tests completed in the current round" value={latest.results.length} max={job.caseCount} />
          <p className="mt-2 text-sm text-ink-soft">{job.model} · {job.screening === "node" ? "Sijil node screening with local task checks" : "Simulated Sijil task checks"} · {job.actor}</p>
          {job.message && <p className="mt-2 text-sm">{job.message}</p>}
          <p className="mt-2 text-xs text-ink-soft">Scores use the approved tests from this run. Tuning guidance is saved for review. Release decisions still require their own approval.</p>
          {[...job.rounds].reverse().map((round, reverseIndex) => {
            const number = job.rounds.length - reverseIndex;
            const passed = round.results.filter((test) => test.passed).length;
            const functional = round.results.filter((test) => test.sijil?.source !== "simulated");
            const score = round.results.length === job.caseCount ? `${(100 * passed / job.caseCount).toFixed(1)}% overall · ${(100 * functional.filter((test) => test.passed).length / (functional.length || 1)).toFixed(1)}% on inference-path tests` : `${passed} passed so far`;
            return (
              <details key={number} className="mt-3 rounded-lg border border-line px-3 py-2" open={reverseIndex === 0 || undefined}>
                <summary className="cursor-pointer text-sm font-medium">Round {number} · {score}{round.results.some((test) => test.hardFailure) ? " · Hard check failed" : ""}</summary>
                {round.instructions && <details className="mt-3 text-sm"><summary className="cursor-pointer underline">See tested instructions</summary><p className="mt-2 whitespace-pre-wrap break-words">{round.instructions}</p></details>}
                {round.results.length > 0 && (
                  <div className="mt-3 overflow-x-auto" role="region" aria-label={`Round ${number} case results`} {...scrollFocus}>
                    <table className="w-full text-sm">
                      <thead><tr className="text-ink-soft"><th scope="col" className="py-1 pe-4 text-start">Test</th><th scope="col" className="py-1 pe-4 text-start">Outcome</th><th scope="col" className="py-1 text-start">Evidence</th></tr></thead>
                      <tbody>
                        {round.results.map((test) => <tr key={test.id} className="border-t border-line align-top">
                          <th scope="row" className="py-2 pe-4 text-start font-normal">{test.title}</th>
                          <td className="py-2 pe-4">{test.status === "blocked_by_sijil" ? `Sijil blocked · ${test.passed ? "as expected" : "unexpected"}` : test.status === "error" ? "Unavailable" : test.passed ? "Passed" : "Failed"}</td>
                          <td className="max-w-[48ch] py-2 break-words">
                            {test.sijil && <p>{test.sijil.source === "node" ? "Sijil node" : "Simulated authority check"}{test.sijil.seq ? ` · Record ${test.sijil.seq}` : ""}{test.sijil.rules.length ? ` · ${test.sijil.rules.join(", ")}` : ""}</p>}
                            {test.differences.length > 0 && <ul className="list-disc ps-4">{test.differences.map((difference, index) => <li key={index}>{difference}</li>)}</ul>}
                            {test.output && <details className="mt-1"><summary className="cursor-pointer underline">Actual output</summary><pre className="mt-1 whitespace-pre-wrap break-all text-xs">{JSON.stringify(test.output, null, 2)}</pre>{test.citations.length > 0 && <p className="mt-1 text-xs">SOP citations · {test.citations.join(", ")}</p>}</details>}
                          </td>
                        </tr>)}
                      </tbody>
                    </table>
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
