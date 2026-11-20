"use client";

import { T } from "../../_components/Lang";
import { ASSUMED_WH_PER_1K_TOKENS, estimatedWh, totalTokens, type Metering } from "@/lib/un/metering";
import { card } from "../../_components/ui";

/** Tokens and seconds are measured; energy is an estimate and says so. */
export default function RunMetering({ metering: m }: { metering?: Metering }) {
  if (!m) return null;
  const unknown = m.calls_without_usage > 0;
  return (
    <section aria-labelledby="meter-h" className={card}>
      <h2 id="meter-h" className="font-mono text-[11px] tracking-[0.22em] text-ink-soft uppercase"><T k="meter.title" en="Run metering" /></h2>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div><dt className="text-ink-soft"><T k="meter.tokens" en="Tokens (measured)" /></dt><dd className="font-mono">{m.llm_calls === 0 ? "none: deterministic" : `${totalTokens(m)} (${m.prompt_tokens} in, ${m.completion_tokens} out)`}</dd></div>
        <div><dt className="text-ink-soft">Model calls</dt><dd className="font-mono">{m.llm_calls}{unknown ? `, ${m.calls_without_usage} without usage data` : ""}</dd></div>
        <div><dt className="text-ink-soft"><T k="meter.seconds" en="Wall-clock seconds (measured)" /></dt><dd className="font-mono">{m.wall_seconds.toFixed(2)}</dd></div>
        <div><dt className="text-ink-soft"><T k="meter.energy" en="Energy (ESTIMATE)" /></dt><dd className="font-mono">~{estimatedWh(m).toFixed(3)} Wh</dd></div>
      </dl>
      <p className="mt-3 max-w-[70ch] text-xs text-ink-soft">
        <strong><T k="meter.estimated" en="Estimated" /></strong>, not measured: tokens × an assumed {ASSUMED_WH_PER_1K_TOKENS} Wh per 1,000 tokens (a placeholder; the provider does not publish its real figure).
        {unknown && " Tokens from calls without usage data are not counted, so totals are a lower bound."}
      </p>
    </section>
  );
}
