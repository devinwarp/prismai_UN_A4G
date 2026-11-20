"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Noto_Sans_Arabic } from "next/font/google";
import { DIR, tr, type Lang } from "@/lib/un/i18n/dict";

// Arabic-capable face, loaded only by the federal screens.
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic" });

const Ctx = createContext<Lang>("en");
export const useLang = () => useContext(Ctx);

/** Translated text; falls back to the English passed in. Usable from server components. */
export function T({ k, en }: { k: string; en: string }) {
  return <>{tr(useLang(), k, en)}</>;
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
  };
  return (
    <Ctx.Provider value={lang}>
      <div
        dir={DIR[lang]}
        lang={lang}
        className={`${arabic.variable} ${lang === "ar" ? "[&_*]:font-[family-name:var(--font-arabic)]" : ""}`}
      >
        <div className="mx-auto flex max-w-6xl justify-end px-4 pt-3 sm:px-6">
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
