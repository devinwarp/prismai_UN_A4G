import type { Metadata } from "next";
import { loadReplays } from "@/lib/un/replay";
import { isSandboxOutcome, SANDBOX_EN } from "@/lib/un/sandbox";

export const metadata: Metadata = {
  title: "Scenario replay",
  description: "Public replay of the four staged scenarios (S1-S4). Synthetic data, no login, no database.",
};

export default async function ReplayPage() {
  const kit = await loadReplays();
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="font-mono text-xs tracking-[0.25em] uppercase">Replay</p>
      <h1 className="font-display mt-2 text-3xl font-medium sm:text-4xl">Staged scenarios S1 to S4</h1>
      <p className="mt-2 max-w-[68ch] text-sm">
        {kit.note} Recorded {kit.recorded_at}. Raw file:{" "}
        <a className="underline" href="/replay/backup-run.json">backup-run.json</a>.
      </p>
      <div className="mt-8 space-y-6">
        {kit.runs.map((r) => (
          <section key={r.scenario_id} aria-labelledby={`h-${r.scenario_id}`} className="rounded-2xl border border-line bg-card p-5">
            <h2 id={`h-${r.scenario_id}`} className="text-xl font-medium">{r.scenario_id}: {r.title}</h2>
            <p className="mt-1 font-mono text-xs">
              {r.chain_ok ? "Hash chain verified" : "Hash chain BROKEN"} · {r.records} records · head {r.head_hash.slice(0, 16)}
            </p>
            <ol className="mt-4 space-y-3">
              {r.steps.map((s) => (
                <li key={s.step} className="border-t border-line pt-3">
                  <p className="font-medium">
                    {s.step}: {s.outcome}{" "}
                    {isSandboxOutcome(s.outcome) && <span className="rounded-md border border-ember/60 px-2 py-0.5 font-mono text-[11px] text-ember">{SANDBOX_EN}</span>}{" "}
                    <span className="font-mono text-xs">{s.match ? "(as expected)" : `(expected ${s.expected})`}</span>
                  </p>
                  {s.events.map((e, i) => <p key={i} className="text-sm">{e}</p>)}
                  {s.reasons.length > 0 && <ul className="mt-1 list-disc ps-5 text-sm">{s.reasons.slice(0, 4).map((x, i) => <li key={i}>{x}</li>)}</ul>}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </main>
  );
}
