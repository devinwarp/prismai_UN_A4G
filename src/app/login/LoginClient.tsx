"use client";

import { Noto_Sans_Arabic } from "next/font/google";
import Link from "next/link";
import { useEffect, useState } from "react";
import PrismMark from "@/components/PrismMark";
import SignInForm, { SIGN_IN_COPY } from "@/components/auth/SignInForm";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { DIR, type Lang } from "@/lib/un/i18n/dict";

const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic" });

const COPY = {
  en: {
    back: "Back to the overview",
    replay: "Watch the replay instead",
    leftTitle: "Know when a government AI helper is safe to switch on, and prove it.",
    points: [
      "60 of 60 test runs reached the outcome the rules require.",
      "Every source the AI cited is a real passage from an official document.",
      "Each answer is signed in a logbook that shows any later edit.",
    ],
    lang: "العربية",
    langAria: "Switch to Arabic",
  },
  ar: {
    back: "العودة إلى الصفحة الرئيسية",
    replay: "شاهد إعادة العرض بدلًا من ذلك",
    leftTitle: "اعرف متى يكون مساعد الذكاء الاصطناعي الحكومي آمنًا للتشغيل، وأثبت ذلك.",
    points: [
      "60 من 60 تشغيلًا اختباريًا وصل إلى النتيجة التي تفرضها القواعد.",
      "كل مصدر استشهد به الذكاء الاصطناعي مقطع حقيقي من وثيقة رسمية.",
      "يُوقَّع كل جواب في سجل يكشف أي تعديل لاحق.",
    ],
    lang: "English",
    langAria: "التبديل إلى الإنجليزية",
  },
} as const;

export default function LoginClient({ judge, judgeFailed }: { judge: boolean; judgeFailed: boolean }) {
  const [lang, setLang] = useState<Lang>("en");
  const c = COPY[lang];

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount to avoid a hydration mismatch
      if (localStorage.getItem("prism-un-lang") === "ar") setLang("ar");
    } catch {}
  }, []);

  const toggleLang = () => {
    const next: Lang = lang === "en" ? "ar" : "en";
    setLang(next);
    try { localStorage.setItem("prism-un-lang", next); } catch {}
  };

  return (
    <div dir={DIR[lang]} lang={lang} className={`paper-bg flex min-h-dvh flex-col ${arabic.variable} ${lang === "ar" ? "[&_*]:font-[family-name:var(--font-arabic)]" : ""}`}>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Prism">
          <PrismMark className="h-8 w-8" />
          <span className="font-display text-xl font-medium">{lang === "ar" ? "بريزم" : "Prism"}</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeSwitcher variant="inline" />
          <button type="button" onClick={toggleLang} aria-label={c.langAria} className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:border-ink-soft"><span lang={lang === "en" ? "ar" : "en"}>{c.lang}</span></button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-20 lg:py-12">
        <div className="order-2 lg:order-1">
          <h2 className="font-display text-3xl leading-tight font-medium text-balance lg:text-4xl">{c.leftTitle}</h2>
          <ul className="mt-6 max-w-[48ch]">
            {c.points.map((p, i) => (
              <li key={p} className="flex gap-3 border-t border-line py-3 text-ink-soft">
                <span className="font-mono text-xs leading-6">{i + 1}</span>{p}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link className="underline underline-offset-4" href="/">{c.back}</Link>
            <a className="underline underline-offset-4" href="/replay">{c.replay}</a>
          </p>
        </div>

        <div className="order-1 w-full max-w-md lg:order-2 lg:justify-self-end">
          <h1 className="font-display text-3xl font-medium">{SIGN_IN_COPY[lang].title}</h1>
          <SignInForm lang={lang} judge={judge} judgeFailed={judgeFailed} focusOnMount />
        </div>
      </main>
    </div>
  );
}
