"use client";

import { useEffect, useState } from "react";
import { Noto_Sans_Arabic } from "next/font/google";
import { DIR, tr, type Lang } from "@/lib/un/i18n/dict";
import { VERDICTS } from "@/lib/un/model";
import { isSandboxOutcome, SANDBOX_EN, SANDBOX_KEY } from "@/lib/un/sandbox";
import type { ReplayKit } from "@/lib/un/replay";

const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic" });
const KEY = "prism-un-lang";

/** Public replay page. Same language toggle and storage key as the federal screens. */
export default function ReplayView({ kit }: { kit: ReplayKit }) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const read = () => { try { setLang(localStorage.getItem(KEY) === "ar" ? "ar" : "en"); } catch {} };
    read();
    window.addEventListener("prism-un-lang", read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener("prism-un-lang", read); window.removeEventListener("storage", read); };
  }, []);
  const pick = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem(KEY, l); } catch {}
    window.dispatchEvent(new Event("prism-un-lang"));
  };
  const outcome = (o: string) => ((VERDICTS as readonly string[]).includes(o) ? tr(lang, `verdict.${o}`, o) : o);
  return (
    <main dir={DIR[lang]} lang={lang} className={`mx-auto max-w-4xl px-4 py-10 sm:px-6 ${arabic.variable} ${lang === "ar" ? "[&_*]:font-[family-name:var(--font-arabic)]" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs tracking-[0.25em] uppercase">{tr(lang, "uc.rp.eyebrow", "Replay")}</p>
        <button type="button" onClick={() => pick(lang === "en" ? "ar" : "en")} className="rounded-lg border border-line bg-paper px-3 py-1 text-xs font-medium hover:border-ink-soft" aria-label={lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"}>
          {lang === "en" ? "العربية" : "English"}
        </button>
      </div>
      <h1 className="font-display mt-2 text-3xl font-medium sm:text-4xl">{tr(lang, "uc.rp.title", "Staged scenarios S1 to S4")}</h1>
      <p className="mt-2 max-w-[68ch] text-sm">
        {tr(lang, "uc.rp.note", kit.note)} {tr(lang, "uc.rp.recorded", "Recorded")} <bdi dir="ltr">{kit.recorded_at}</bdi>. {tr(lang, "uc.rp.raw", "Raw file:")}{" "}
        <a className="underline" href="/replay/backup-run.json"><bdi dir="ltr">backup-run.json</bdi></a>.
      </p>
      <div className="mt-8 space-y-6">
        {kit.runs.map((r) => (
          <section key={r.scenario_id} aria-labelledby={`h-${r.scenario_id}`} className="rounded-2xl border border-line bg-card p-5">
            <h2 id={`h-${r.scenario_id}`} className="text-xl font-medium"><bdi dir="ltr">{r.scenario_id}</bdi>: {r.title}</h2>
            <p className="mt-1 font-mono text-xs">
              {r.chain_ok ? tr(lang, "uc.rp.chain_ok", "Hash chain verified") : tr(lang, "uc.rp.chain_bad", "Hash chain BROKEN")} · {r.records} {tr(lang, "uc.rp.records", "records")} · {tr(lang, "uc.rp.head", "head")} <bdi dir="ltr" className="break-all">{r.head_hash.slice(0, 16)}</bdi>
            </p>
            <ol className="mt-4 space-y-3">
              {r.steps.map((s) => (
                <li key={s.step} className="border-t border-line pt-3">
                  <p className="font-medium">
                    <bdi dir="ltr">{s.step}</bdi>: {outcome(s.outcome)}{" "}
                    {isSandboxOutcome(s.outcome) && <span className="rounded-md border border-ember/60 px-2 py-0.5 font-mono text-[11px] text-ember">{tr(lang, SANDBOX_KEY, SANDBOX_EN)}</span>}{" "}
                    <span className="font-mono text-xs">{s.match ? tr(lang, "uc.rp.as_expected", "(as expected)") : `${tr(lang, "uc.rp.expected", "(expected {v})").replace("{v}", outcome(s.expected))}`}</span>
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
