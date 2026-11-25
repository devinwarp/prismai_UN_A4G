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
  const lang = useLang();
  const n = typeof v.n === "number" ? v.n : undefined;
  return <>{(n === undefined ? tr(lang, k, en) : trN(lang, k, en, n, one)).replace(/\{(\w+)\}/g, (_, n: string) => String(v[n] ?? ""))}</>;
}

const PickCtx = createContext<(l: Lang) => void>(() => {});

/** The "synthetic data" badge and the language toggle. LangShell draws it on its own row; a page that passes `bare` draws it itself, in its own toolbar. */
export function LangBar() {
  const lang = useLang();
  const pick = useContext(PickCtx);
  return (
    <>
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
    </>
  );
}

/** Wraps a federal page: language toggle (remembered per browser), dir and font. */
export default function LangShell({ children, bare = false }: { children: ReactNode; /** Skip the badge/toggle row: the page renders <LangBar /> itself. */ bare?: boolean }) {
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
      <PickCtx.Provider value={pick}>
        <div
          dir={DIR[lang]}
          lang={lang}
          className={`fed ${arabic.variable} ${lang === "ar" ? "[&_*]:font-[family-name:var(--font-arabic)]" : ""} ${bare ? "flex min-h-0 flex-1 flex-col" : ""}`}
        >
          {!bare && (
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3 sm:px-6">
              <LangBar />
            </div>
          )}
          {children}
        </div>
      </PickCtx.Provider>
    </Ctx.Provider>
  );
}
