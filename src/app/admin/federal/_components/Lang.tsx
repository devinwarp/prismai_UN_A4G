"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Noto_Sans_Arabic } from "next/font/google";
import { DIR, tr, trN, type Lang } from "@/lib/un/i18n/dict";
import "./federal.css";

// Arabic-capable face, loaded only by the federal screens.
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic" });

const Ctx = createContext<Lang>("en");
export const useLang = () => useContext(Ctx);

/** Translated text; falls back to the English passed in. Usable from server components. */
export function T({ k, en }: { k: string; en: string }) {
  return <>{tr(useLang(), k, en)}</>;
}

/** Translated text with {name} placeholders filled from v. */
export function TV({ k, en, v, one }: { k: string; en: string; v: Record<string, string | number>; one?: string }) {
  const n = typeof v.n === "number" ? v.n : undefined;
  return <>{(n === undefined ? tr(useLang(), k, en) : trN(useLang(), k, en, n, one)).replace(/\{(\w+)\}/g, (_, n: string) => String(v[n] ?? ""))}</>;
}

/** Wraps a federal page: language toggle (remembered per browser), dir and font. */
export default function LangShell({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount to avoid a hydration mismatch
      if (localStorage.getItem("prism-un-lang") === "ar") setLang("ar");
    } catch {}
  }, []);
  const pick = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem("prism-un-lang", l); } catch {}
    window.dispatchEvent(new Event("prism-un-lang")); // the journey bar sits outside this shell and follows it
  };
  return (
    <Ctx.Provider value={lang}>
      <div
        dir={DIR[lang]}
        lang={lang}
        className={`fed ${arabic.variable} ${lang === "ar" ? "[&_*]:font-[family-name:var(--font-arabic)]" : ""}`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3 sm:px-6">
          <span title={tr(lang, "sim.hint", "Every use case, run and attestation here is fictitious. Sijil is simulated.")} className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">
            <span aria-hidden>◇</span> {tr(lang, "sim.badge", "Synthetic data · simulated Sijil")}
          </span>
          <button
            type="button"
            onClick={() => pick(lang === "en" ? "ar" : "en")}
            className="rounded-lg border border-line bg-paper px-3 py-1 text-xs font-medium text-ink hover:border-ink-soft"
            aria-label={lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"}
          >
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
        {children}
      </div>
    </Ctx.Provider>
  );
}
