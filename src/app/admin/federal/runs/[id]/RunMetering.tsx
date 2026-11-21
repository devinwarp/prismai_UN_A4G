"use client";

import { T, TV, useLang } from "../../_components/Lang";
import { ASSUMED_WH_PER_1K_TOKENS, estimatedWh, totalTokens, type Metering } from "@/lib/un/metering";
import { tr } from "@/lib/un/i18n/dict";
import { card } from "../../_components/ui";

/** Tokens and seconds are measured; energy is an estimate and says so. */
export default function RunMetering({ metering: m }: { metering?: Metering }) {
  const lang = useLang();
  if (!m) return null;
  const unknown = m.calls_without_usage > 0;
  return (
    <section aria-labelledby="meter-h" className={card}>
      <h2 id="meter-h" className="font-mono text-[11px] tracking-[0.22em] text-ink-soft uppercase"><T k="meter.title" en="Run metering" /></h2>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div><dt className="text-ink-soft"><T k="meter.tokens" en="Tokens (measured)" /></dt><dd className="font-mono">{m.llm_calls === 0 ? tr(lang, "uc.meter.none", "none: deterministic") : tr(lang, "uc.meter.tok_fmt", "{t} ({i} in, {o} out)").replace("{t}", String(totalTokens(m))).replace("{i}", String(m.prompt_tokens)).replace("{o}", String(m.completion_tokens))}</dd></div>
        <div><dt className="text-ink-soft"><T k="uc.meter.calls" en="Model calls" /></dt><dd className="font-mono">{m.llm_calls}{unknown ? tr(lang, "uc.meter.nousage", ", {n} without usage data").replace("{n}", String(m.calls_without_usage)) : ""}</dd></div>
        <div><dt className="text-ink-soft"><T k="meter.seconds" en="Wall-clock seconds (measured)" /></dt><dd className="font-mono">{m.wall_seconds.toFixed(2)}</dd></div>
        <div><dt className="text-ink-soft"><T k="meter.energy" en="Energy (ESTIMATE)" /></dt><dd className="font-mono">~{estimatedWh(m).toFixed(3)} {tr(lang, "uc.meter.wh", "Wh")}</dd></div>
      </dl>
      <p className="mt-3 max-w-[70ch] text-xs text-ink-soft">
        <strong><T k="meter.estimated" en="Estimated" /></strong><TV k="uc.meter.note" en=", not measured: tokens × an assumed {x} Wh per 1,000 tokens (a placeholder; the provider does not publish its real figure)." v={{ x: ASSUMED_WH_PER_1K_TOKENS }} />
        {unknown && <> <T k="uc.meter.lower" en="Tokens from calls without usage data are not counted, so totals are a lower bound." /></>}
      </p>
    </section>
  );
}
