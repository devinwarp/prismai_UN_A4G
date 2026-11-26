"use client";

import { Noto_Sans_Arabic } from "next/font/google";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import PrismMark from "@/components/PrismMark";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { DIR, type Lang } from "@/lib/un/i18n/dict";
import { COPY, REPO, REPORT } from "@/lib/un/landing/copy";
import { track } from "@/lib/track";
import Logbook from "./Logbook";
import SignInDialog from "./SignInDialog";

const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic" });

const btn = "inline-flex min-h-12 whitespace-nowrap items-center justify-center rounded-lg px-5 text-base font-medium";
const primary = `${btn} bg-lit-deep text-paper hover:opacity-90`;
const secondary = `${btn} border border-ink text-ink hover:bg-paper-deep`;
const onPine = `${btn} bg-paper text-lit-deep hover:opacity-90`;

/** A measured figure with a plain-language note on how it was measured, behind an information button. */
function ProofStat({ n, d, how, label }: { n: string; d: string; how: string; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-t border-line py-4">
      <dt className="font-display text-2xl font-medium text-lit-deep">{n}</dt>
      <dd className="mt-1 max-w-[52ch] text-ink-soft">
        {d}{" "}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={label}
          onClick={() => setOpen((o) => !o)}
          className="-my-2 inline-flex h-8 w-8 items-center justify-center rounded-full align-middle text-ink-soft hover:text-ink aria-expanded:text-lit-deep"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5.5" />
            <path d="M12 7.6h.01" strokeWidth="2.2" />
          </svg>
        </button>
      </dd>
      <dd id={id} hidden={!open} className="mt-2 max-w-[52ch] rounded-lg bg-paper-deep px-3 py-2 text-sm leading-relaxed text-ink-soft">{how}</dd>
    </div>
  );
}

/** One way in. The first door is the lit one (pine); the others are plain panels. */
function Door({ lit, title, body, children, className = "" }: { lit?: boolean; title: string; body: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col justify-between gap-6 rounded-2xl border p-6 sm:p-7 ${lit ? "border-lit-deep bg-lit-deep text-paper" : "border-line bg-card text-ink"} ${className}`}>
      <div>
        <h2 className="font-display text-2xl leading-tight font-medium text-balance sm:text-3xl">{title}</h2>
        <p className={`mt-3 max-w-[40ch] text-base leading-relaxed ${lit ? "text-paper/85" : "text-ink-soft"}`}>{body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">{children}</div>
    </div>
  );
}

export default function Landing({ signedIn, judgeHref }: { signedIn: boolean; judgeHref: string }) {
  const [lang, setLang] = useState<Lang>("en");
  const [stuck, setStuck] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const heroCta = useRef<HTMLAnchorElement>(null);
  const c = COPY[lang];
  const href = signedIn ? "/admin/federal" : judgeHref;
  const label = signedIn ? c.ctaSignedIn : c.stickyCta;

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount to avoid a hydration mismatch
      if (localStorage.getItem("prism-un-lang") === "ar") setLang("ar");
    } catch {}
    track("landing_view");
  }, []);

  // Once the demo door has scrolled out of view, the header carries the same action, so it never covers the page's content.
  useEffect(() => {
    const el = heroCta.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The header is solid from the first scroll, so the headline and doors never slide under its controls.
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const pick = () => {
    const next: Lang = lang === "en" ? "ar" : "en";
    setLang(next);
    try { localStorage.setItem("prism-un-lang", next); } catch {}
    track("lang_toggle", { to: next });
  };
  // The one-click judge account may not be set up (then the demo button would only lead to the sign-in page), so the button opens the sign-in dialog instead.
  const judge = judgeHref !== "/login";
  const cta = (place: string) => (e: React.MouseEvent) => {
    track("cta_demo", { place });
    if (!signedIn && !judge) { e.preventDefault(); setSignInOpen(true); }
  };
  // Sign in opens as a dialog over the page. The link keeps its /login address for a new tab or when scripts are off.
  const signIn = (place: string) => (e: React.MouseEvent) => {
    track("cta_signin", { place });
    e.preventDefault();
    setSignInOpen(true);
  };
  const replay = (place: string) => () => track("cta_replay", { place });

  return (
    <div dir={DIR[lang]} lang={lang} className={`paper-bg min-h-dvh ${arabic.variable} ${lang === "ar" ? "[&_*]:font-[family-name:var(--font-arabic)]" : ""}`}>
      <a href="#main" className="absolute start-4 top-2 z-50 -translate-y-16 rounded bg-card px-3 py-2 focus:translate-y-0">{c.skip}</a>
      <header className={`sticky top-0 z-30 border-b transition-colors duration-200 ${scrolled || stuck ? "border-line bg-paper" : "border-transparent"}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label={c.brand}>
            <PrismMark className="h-8 w-8" />
            <span className={`font-display text-xl font-medium ${stuck ? "hidden sm:inline" : ""}`}>{c.brand}</span>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {stuck && <a href={href} onClick={cta("header")} className={`${primary} min-h-10 px-4 text-sm`}>{label}</a>}
            {!signedIn && (
              <a href="/login" onClick={signIn("header")} className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-ink underline-offset-4 hover:underline sm:px-3">{c.signIn}</a>
            )}
            <div className={stuck ? "hidden sm:block" : ""}><ThemeSwitcher variant="inline" /></div>
            <button type="button" onClick={pick} aria-label={c.langAria} className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:border-ink-soft">{c.langSwitch}</button>
          </div>
        </div>
      </header>

      <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} lang={lang} judge={judge} closeLabel={c.close} />

      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pt-6 pb-12 sm:px-6 sm:pt-10 lg:pt-12 lg:pb-16">
          <h1 className="max-w-4xl font-display text-[clamp(2.25rem,6vw,4.25rem)] leading-[1.06] font-medium tracking-tight text-balance">{c.headline}</h1>
          <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-ink-soft sm:text-xl">{c.sub}</p>

          <div role="group" aria-label={c.doorsAria} className="mt-8 grid gap-4 sm:grid-cols-2 lg:mt-10 lg:grid-cols-[1.3fr_1fr_1fr]">
            <Door lit title={signedIn ? c.ctaSignedIn : c.doorDemoTitle} body={signedIn ? c.doorDashBody : c.doorDemoBody} className="sm:col-span-2 lg:col-span-1">
              <a ref={heroCta} href={href} onClick={cta("hero")} className={onPine}>{label}</a>
              {!signedIn && (
                <a href="/replay" onClick={replay("hero")} className="text-base font-medium underline underline-offset-4 hover:opacity-85">{c.ctaSecondary}</a>
              )}
            </Door>
            {signedIn ? (
              <Door title={c.ctaSecondary} body={c.doorReplayBody}>
                <a href="/replay" onClick={replay("door")} className={secondary}>{c.doorReplayCta}</a>
              </Door>
            ) : (
              <Door title={c.doorSignTitle} body={c.doorSignBody}>
                <a href="/login" onClick={signIn("door")} className={secondary}>{c.signIn}</a>
              </Door>
            )}
            <Door title={c.doorEvTitle} body={c.doorEvBody}>
              <a href="#evidence" onClick={() => track("cta_evidence", { place: "door" })} className={secondary}>{c.doorEvCta}</a>
            </Door>
          </div>

          <a href="#logbook" onClick={() => track("cta_logbook", { place: "strip" })} className="group mt-8 inline-flex min-h-11 items-center gap-4 text-sm text-ink-soft">
            <span aria-hidden="true" className="flex items-center">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="flex items-center">
                  <span style={{ "--i": i } as CSSProperties} className="seal-dot block h-3.5 w-3.5 rounded-full border border-lit bg-lit-soft" />
                  {i < 5 && <span className="block h-px w-5 bg-lit sm:w-7" />}
                </span>
              ))}
            </span>
            <span className="underline underline-offset-4 group-hover:text-ink">{c.chainStrip}</span>
          </a>
        </section>

        <section id="logbook" aria-labelledby="how-h" className="scroll-mt-20 border-y border-line bg-paper-deep/60">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:py-20">
            <div>
              <h2 id="how-h" className="font-display text-2xl font-medium sm:text-3xl">{c.howTitle}</h2>
              <ol className="mt-6">
                {c.how.map(([t, d], i) => (
                  <li key={t} className="border-t border-line py-5">
                    <h3 className="font-display text-2xl font-medium"><span className="me-3 font-mono text-sm text-ink-soft">{i + 1}</span>{t}</h3>
                    <p className="mt-2 max-w-[52ch] text-lg leading-relaxed text-ink-soft">{d}</p>
                  </li>
                ))}
              </ol>
            </div>
            <Logbook c={c} />
          </div>
        </section>

        <section id="evidence" aria-labelledby="proof-h" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
            <h2 id="proof-h" className="font-display text-2xl font-medium sm:text-3xl">{c.proofTitle}</h2>
            <dl className="mt-8 grid gap-x-12 lg:grid-cols-2">
              {c.proof.map(([n, d, how]) => <ProofStat key={n} n={n} d={d} how={how} label={c.proofHow} />)}
            </dl>
            <p className="mt-6 max-w-[68ch] leading-relaxed">
              {c.proofHonest}{" "}
              <a className="underline underline-offset-4" href={`${REPO}/blob/main/docs/eval/agent-results.md`} onClick={() => track("link_eval")}>{c.proofHonestLink}</a>
            </p>
          </div>
        </section>

        <section aria-labelledby="same-h" className="border-y border-line bg-paper-deep/60">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:py-16">
            <div>
              <h2 id="same-h" className="font-display text-2xl font-medium sm:text-3xl">{c.sameTitle}</h2>
              <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-ink-soft">{c.sameBody}</p>
            </div>
            <ul className="grid gap-x-8 sm:grid-cols-2">
              {c.rules.map((r, i) => (
                <li key={r} className="flex gap-3 border-t border-line py-2.5 text-base">
                  <span className="font-mono text-xs leading-6 text-ink-soft">{i + 1}</span>{r}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="who-h" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
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
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <a href={href} onClick={cta("final")} className={primary}>{label}</a>
              {signedIn
                ? <a href="/replay" onClick={replay("final")} className={secondary}>{c.ctaSecondary}</a>
                : <a href="/login" onClick={signIn("final")} className={secondary}>{c.signIn}</a>}
            </div>
            {!signedIn && <p className="text-sm text-ink-soft">{c.ctaNote}</p>}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-8 pb-10 text-sm text-ink-soft sm:px-6">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <a className="underline underline-offset-4" href={REPORT} onClick={() => track("link_report")}>{c.footer.report}</a>
          <a className="underline underline-offset-4" href={REPO} onClick={() => track("link_repo")}>{c.footer.code}</a>
          <a className="underline underline-offset-4" href="/replay">{c.footer.replay}</a>
          <a className="underline underline-offset-4" href="/login">{c.footer.signin}</a>
        </nav>
        <p>{c.footer.note}</p>
      </footer>
    </div>
  );
}
