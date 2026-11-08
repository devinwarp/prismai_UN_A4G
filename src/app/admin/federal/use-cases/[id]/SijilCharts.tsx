"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { CRITERIA, HARD, type Criterion, type SijilRun } from "@/lib/un/sijil";

export const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** Per-run values against one threshold. Breaching runs are drawn as ✕-shaped ember marks, not just a colour change. */
export function MetricChart({
  title, runs, pick, threshold, kind, mean, label,
}: {
  title: string;
  runs: SijilRun[];
  pick: (r: SijilRun) => number;
  threshold: number;
  kind: "min" | "max";
  mean: number;
  label: string;
}) {
  const breach = (v: number) => (kind === "min" ? v < threshold : v > threshold);
  const data = runs.map((r) => ({ run: r.run_no, v: pick(r) }));
  const vals = data.map((d) => d.v);
  const lo = Math.max(0, Math.min(threshold, ...vals, mean) - (kind === "min" ? 0.04 : 0.003));
  const hi = Math.min(1, Math.max(threshold, ...vals, mean) + (kind === "min" ? 0.015 : 0.01));
  const ok = runs.length > 0 && !breach(mean);
  return (
    <figure className="rounded-2xl border border-line bg-card p-5">
      <figcaption>
        <p className="font-mono text-[11px] tracking-widest text-ink-soft uppercase">{title}</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className={`font-display text-3xl font-medium tabular-nums ${runs.length && !ok ? "text-ember" : ""}`}>{runs.length ? pct(mean) : "-"}</span>
          {runs.length > 0 && <span className={`text-xs font-medium ${ok ? "text-lit-deep" : "text-ember"}`}>{ok ? "✓ within threshold" : "✕ outside threshold"}</span>}
        </p>
        <p className="text-xs text-ink-soft">{label}</p>
      </figcaption>
      {runs.length > 0 ? (
        <div role="img" aria-label={`${title} per run, ${runs.length} runs, mean ${pct(mean)}, threshold ${kind === "min" ? "at least" : "at most"} ${pct(threshold)}. Values are in the runs table below.`} className="mt-3 h-44">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 176 }}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="run" tick={{ fill: "var(--color-ink-soft)", fontSize: 11 }} stroke="var(--color-line)" tickLine={false} />
              <YAxis domain={[lo, hi]} width={44} tickFormatter={(v: number) => pct(v)} tick={{ fill: "var(--color-ink-soft)", fontSize: 11 }} stroke="var(--color-line)" tickLine={false} tickCount={4} />
              <ReferenceLine y={threshold} stroke="var(--color-ink)" strokeDasharray="5 4" label={{ value: `${kind === "min" ? "min" : "max"} ${pct(threshold)}`, position: "insideTopRight", fill: "var(--color-ink)", fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="v"
                stroke="var(--color-lit)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={(p: { cx?: number; cy?: number; payload?: { v: number }; index?: number }) => {
                  const { cx = 0, cy = 0, payload, index } = p;
                  return payload && breach(payload.v) ? (
                    <path key={index} d={`M${cx - 4} ${cy - 4}L${cx + 4} ${cy + 4}M${cx + 4} ${cy - 4}L${cx - 4} ${cy + 4}`} stroke="var(--color-ember)" strokeWidth={2.5} fill="none" />
                  ) : (
                    <circle key={index} cx={cx} cy={cy} r={2.5} fill="var(--color-lit)" />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-8 text-center text-sm text-ink-soft">Run a pilot to plot this measure.</p>
      )}
    </figure>
  );
}

/** Rejects per criterion. Hard criteria must be 0: any reject is drawn in ember with a ✕. */
export function RejectBars({ rejects }: { rejects: Record<Criterion, number> }) {
  const max = Math.max(1, ...CRITERIA.map((c) => rejects[c]));
  return (
    <ul className="space-y-3">
      {CRITERIA.map((c) => {
        const hard = HARD.includes(c);
        const n = rejects[c];
        const bad = hard && n > 0;
        return (
          <li key={c}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                {c.replaceAll("_", " ")}
                <span className="ml-2 rounded border border-line px-1.5 py-px font-mono text-[10px] text-ink-soft uppercase">{hard ? "hard · must be 0" : "measure"}</span>
              </span>
              <span className={`font-mono tabular-nums ${bad ? "font-medium text-ember" : ""}`}>{bad && <span aria-hidden>✕ </span>}{n}</span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-paper-deep" role="img" aria-label={`${n} rejects`}>
              <div className="bar-grow h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: bad ? "var(--color-ember)" : "var(--color-v-sup)" }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One cell per run toward the target; a cell is hollow-red when that run breached a threshold or had any reject. */
export function RunProgress({
  runs, target, runOk, filed,
}: { runs: SijilRun[]; target: number; runOk: (r: SijilRun) => boolean; filed: { pass: boolean; runs: number } | null }) {
  const cells = Array.from({ length: Math.max(target, runs.length) }, (_, i) => runs[i]);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          <span className="font-display text-2xl tabular-nums">{runs.length}</span> <span className="text-ink-soft">of {target} runs toward the pilot report</span>
        </p>
        <p className="text-sm" role="status">
          {filed ? (
            <span className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${filed.pass ? "border-lit/50 bg-lit-soft/50 text-lit-deep" : "border-ember/60 text-ember"}`}>
              {filed.pass ? "✓" : "✕"} Latest report: {filed.pass ? "PASS" : "FAIL"} · {filed.runs} runs
            </span>
          ) : (
            <span className="text-ink-soft">{runs.length >= target ? "Report due" : `Report files automatically in ${target - runs.length} more`}</span>
          )}
        </p>
      </div>
      <ol className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(30, cells.length)}, minmax(0, 1fr))` }} aria-label={`Run ${runs.length} of ${target}`}>
        {cells.map((r, i) => (
          <li
            key={i}
            title={r ? `Run ${r.run_no}: ${runOk(r) ? "within thresholds" : "breach"}` : `Run ${i + 1}: not yet`}
            className={`flex h-6 items-center justify-center rounded-sm text-[9px] leading-none ${r ? (runOk(r) ? "bg-lit text-paper" : "border-2 border-ember text-ember") : "border border-dashed border-line"}`}
          >
            <span aria-hidden>{r ? (runOk(r) ? "" : "✕") : ""}</span>
            <span className="sr-only">{r ? (runOk(r) ? "ok" : "breach") : "pending"}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 font-mono text-[11px] text-ink-soft">Solid = run within every threshold · ✕ = run breached a threshold or a hard criterion · dashed = not run yet</p>
    </div>
  );
}
