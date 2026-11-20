"use client";

import { Noto_Sans_Arabic } from "next/font/google";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import PrismMark from "@/components/PrismMark";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { DIR, type Lang } from "@/lib/un/i18n/dict";
import { COPY, REPO, REPORT } from "@/lib/un/landing/copy";
import { track } from "@/lib/track";
import Logbook from "./Logbook";

const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic" });

const btn = "inline-flex min-h-12 whitespace-nowrap items-center justify-center rounded-lg px-5 text-base font-medium";
const primary = `${btn} bg-lit-deep text-paper hover:opacity-90`;
const secondary = `${btn} border border-ink text-ink hover:bg-paper-deep`;

export default function Landing({ signedIn, judgeHref }: { signedIn: boolean; judgeHref: string }) {
  const [lang, setLang] = useState<Lang>("en");
  const [stuck, setStuck] = useState(false);
  const heroCta = useRef<HTMLAnchorElement>(null);
  const c = COPY[lang];
  const href = signedIn ? "/admin/federal" : judgeHref;
  const label = signedIn ? c.ctaSignedIn : c.cta;

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount to avoid a hydration mismatch
      if (localStorage.getItem("prism-un-lang") === "ar") setLang("ar");
    } catch {}
    track("landing_view");
  }, []);

  useEffect(() => {
    const el = heroCta.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const pick = () => {
    const next: Lang = lang === "en" ? "ar" : "en";
    setLang(next);
    try { localStorage.setItem("prism-un-lang", next); } catch {}
    track("lang_toggle", { to: next });
  };
  const cta = (place: string) => () => track("cta_demo", { place });

  return (
    <div dir={DIR[lang]} lang={lang} className={`paper-bg min-h-dvh ${arabic.variable} ${lang === "ar" ? "[&_*]:font-[family-name:var(--font-arabic)]" : ""}`}>
      <a href="#main" className="absolute start-4 top-2 z-50 -translate-y-16 rounded bg-card px-3 py-2 focus:translate-y-0">{c.skip}</a>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={c.brand}>
          <PrismMark className="h-8 w-8" />
          <span className="font-display text-xl font-medium">{c.brand}</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeSwitcher variant="inline" />
          <button type="button" onClick={pick} aria-label={c.langAria} className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:border-ink-soft">{c.langSwitch}</button>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:pt-16 lg:pb-24">
          <div>
            <h1 className="font-display text-[clamp(2.1rem,5.2vw,3.6rem)] leading-[1.08] font-medium tracking-tight text-balance">{c.headline}</h1>
            <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-ink-soft">{c.sub}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a ref={heroCta} href={href} onClick={cta("hero")} className={primary}>{label}</a>
              <a href="/replay" onClick={() => track("cta_replay", { place: "hero" })} className={secondary}>{c.ctaSecondary}</a>
            </div>
            <p className="mt-3 text-sm text-ink-soft">{c.ctaNote}</p>
          </div>
          <Logbook c={c} />
        </section>

        <section aria-labelledby="proof-h" className="border-y border-line bg-paper-deep/60">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="proof-h" className="font-display text-2xl font-medium sm:text-3xl">{c.proofTitle}</h2>
            <dl className="mt-8 grid gap-x-12 lg:grid-cols-2">
              {c.proof.map(([n, d]) => (
                <div key={n} className="border-t border-line py-4">
                  <dt className="font-display text-2xl font-medium text-lit-deep">{n}</dt>
                  <dd className="mt-1 max-w-[52ch] text-ink-soft">{d}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 max-w-[68ch] leading-relaxed">
              {c.proofHonest}{" "}
              <a className="underline underline-offset-4" href={`${REPO}/blob/main/docs/eval/agent-results.md`} onClick={() => track("link_eval")}>{c.proofHonestLink}</a>
            </p>
          </div>
        </section>

        <section aria-labelledby="how-h" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="how-h" className="font-display text-2xl font-medium sm:text-3xl">{c.howTitle}</h2>
          <ol className="mt-8">
            {c.how.map(([t, d], i) => (
              <li key={t} className="grid gap-2 border-t border-line py-6 md:grid-cols-[14rem_1fr] md:gap-10">
                <h3 className="font-display text-3xl font-medium"><span className="me-3 font-mono text-sm text-ink-soft">{i + 1}</span>{t}</h3>
                <p className="max-w-[60ch] text-lg leading-relaxed text-ink-soft">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="same-h" className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-2 lg:gap-14">
          <div>
            <h2 id="same-h" className="font-display text-2xl font-medium sm:text-3xl">{c.sameTitle}</h2>
            <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-ink-soft">{c.sameBody}</p>
          </div>
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {c.rules.map((r, i) => (
              <li key={r} className="flex gap-3 border-t border-line py-2.5 text-[15px]">
                <span className="font-mono text-xs leading-6 text-ink-soft">{i + 1}</span>{r}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="who-h" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 id="who-h" className="font-display text-2xl font-medium sm:text-3xl">{c.whoTitle}</h2>
          <ul className="mt-6">
            {c.who.map(([t, d]) => (
              <li key={t} className="grid gap-1 border-t border-line py-4 md:grid-cols-[18rem_1fr] md:gap-10">
                <p className="font-medium">{t}</p>
                <p className="max-w-[60ch] text-ink-soft">{d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="faq-h" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 id="faq-h" className="font-display text-2xl font-medium sm:text-3xl">{c.faqTitle}</h2>
          <div className="mt-6 max-w-3xl">
            {c.faq.map(([q, a]) => (
              <details key={q} className="group border-t border-line" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && track("faq_open", { q: q.slice(0, 40) })}>
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <span aria-hidden="true" className="font-mono text-ink-soft group-open:hidden">+</span>
                  <span aria-hidden="true" className="hidden font-mono text-ink-soft group-open:inline">{"−"}</span>
                </summary>
                <p className="pb-4 leading-relaxed text-ink-soft">{a}</p>
              </details>
            ))}
            <div className="border-t border-line" />
          </div>
          <div className="mt-10 max-w-3xl">
            <h3 className="font-display text-xl font-medium">{c.trustTitle}</h3>
            <p className="mt-2 leading-relaxed text-ink-soft">{c.trust}</p>
          </div>
        </section>

        <section aria-labelledby="final-h" className="border-t border-line bg-paper-deep/60">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6">
            <h2 id="final-h" className="font-display text-3xl font-medium sm:text-4xl">{c.finalTitle}</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a href={href} onClick={cta("final")} className={primary}>{label}</a>
              <a href="/replay" onClick={() => track("cta_replay", { place: "final" })} className={secondary}>{c.ctaSecondary}</a>
            </div>
            <p className="text-sm text-ink-soft">{c.ctaNote}</p>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-8 pb-28 text-sm text-ink-soft sm:px-6 lg:pb-10">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <a className="underline underline-offset-4" href={REPORT} onClick={() => track("link_report")}>{c.footer.report}</a>
          <a className="underline underline-offset-4" href={REPO} onClick={() => track("link_repo")}>{c.footer.code}</a>
          <a className="underline underline-offset-4" href="/replay">{c.footer.replay}</a>
          <a className="underline underline-offset-4" href="/login">{c.footer.signin}</a>
        </nav>
        <p>{c.footer.note}</p>
      </footer>

      {/* Sticky action once the hero button has scrolled away. Hidden from tab order while off-screen. */}
      <div
        aria-hidden={!stuck}
        className={`fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-300 motion-reduce:transition-none lg:inset-x-auto lg:end-6 lg:bottom-6 lg:p-0 ${stuck ? "translate-y-0" : "pointer-events-none translate-y-[150%]"}`}
      >
        <a href={href} tabIndex={stuck ? 0 : -1} onClick={cta("sticky")} className={`${primary} w-full max-w-md shadow-lg lg:w-auto`}>{signedIn ? c.ctaSignedIn : c.stickyCta}</a>
      </div>
    </div>
  );
}
