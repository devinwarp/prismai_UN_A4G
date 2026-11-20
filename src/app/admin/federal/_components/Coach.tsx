"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "./Lang";

const KEY = "fed-start-dismissed";

export interface StartStep { n: number; k: string; en: string; hintK: string; hint: string; href?: string; tour?: boolean }

/** Inline "Start here" strip: three steps, dismissible, remembered per browser. No modal. */
export function StartHere({ steps, onTour }: { steps: StartStep[]; onTour: () => void }) {
  const lang = useLang();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount to avoid a hydration mismatch
      if (localStorage.getItem(KEY) === "1") setOpen(false);
    } catch {}
  }, []);
  const dismiss = () => { setOpen(false); try { localStorage.setItem(KEY, "1"); } catch {} };
  if (!open) return null;
  return (
    <section aria-labelledby="start-h" data-tour="start" className="fx-rise rounded-2xl border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-ink-soft uppercase">{tr(lang, "start.eyebrow", "First time here")}</p>
          <h2 id="start-h" className="font-display mt-1 text-2xl font-medium tracking-tight">{tr(lang, "start.title", "Start here: three steps, about two minutes")}</h2>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button type="button" onClick={onTour} className="rounded-lg border border-line px-3 py-1.5 font-medium hover:border-ink-soft">{tr(lang, "start.tour", "Take the tour")}</button>
          <button type="button" onClick={dismiss} className="text-ink-soft underline underline-offset-2 hover:text-ink">{tr(lang, "start.dismiss", "Dismiss")}</button>
        </div>
      </div>
      <ol className="mt-5 grid gap-5 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.n} className="fx-rise flex gap-3" style={{ ["--i" as string]: i + 1 }}>
            <span aria-hidden className="font-display text-4xl leading-none text-lit tabular-nums">{s.n}</span>
            <div className="min-w-0">
              {s.href ? <Link href={s.href} className="text-base font-medium underline decoration-line underline-offset-4 hover:decoration-ink">{tr(lang, s.k, s.en)} →</Link> : <p className="text-base font-medium">{tr(lang, s.k, s.en)}</p>}
              <p className="mt-1 text-sm text-ink-soft">{tr(lang, s.hintK, s.hint)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export interface TourStep { target: string; k: string; title: string; body: string }

/** Lightweight coach marks: ring + popover anchored to [data-tour=target]. Esc closes, arrows move, focus follows. */
export function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const lang = useLang();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ r: DOMRect; top: number; left: number } | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const live = steps.filter((s) => typeof document !== "undefined" && document.querySelector(`[data-tour="${s.target}"]`));
  const s = live[Math.min(i, live.length - 1)];

  const place = useCallback(() => {
    const el = s && document.querySelector(`[data-tour="${s.target}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const h = pop.current?.offsetHeight ?? 180;
    const w = pop.current?.offsetWidth ?? 352;
    const below = r.bottom + 12 + h < window.innerHeight;
    const top = below ? r.bottom + 12 : Math.max(8, r.top - 12 - h);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    setBox({ r, top, left });
  }, [s]);

  useLayoutEffect(() => {
    if (!open || !s) return;
    const el = document.querySelector(`[data-tour="${s.target}"]`);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    const t = window.setTimeout(place, calm ? 0 : 350);
    place();
    return () => window.clearTimeout(t);
  }, [open, s, place]);

  useEffect(() => {
    if (!open) return;
    const on = () => place();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("scroll", on, true); };
  }, [open, place]);

  useEffect(() => { if (open) pop.current?.focus(); }, [open, i]);

  if (!open || !s) return null;
  const last = i >= live.length - 1;
  const close = () => { setI(0); onClose(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") { if (last) close(); else setI(i + 1); }
    else if (e.key === "ArrowLeft") setI(Math.max(0, i - 1));
  };
  return (
    <>
      {box && <div aria-hidden className="fed-coach-ring" style={{ top: box.r.top - 6, left: box.r.left - 6, width: box.r.width + 12, height: box.r.height + 12 }} />}
      <div ref={pop} role="dialog" aria-label={tr(lang, "tour.label", "Guided tour")} tabIndex={-1} onKeyDown={onKey} className="fed-coach fx-coach" style={{ top: box?.top ?? 80, left: box?.left ?? 16 }}>
        <p className="font-mono text-[11px] tracking-[0.2em] text-ink-soft uppercase">{i + 1} / {live.length}</p>
        <p className="font-display mt-1 text-xl font-medium">{tr(lang, `${s.k}.t`, s.title)}</p>
        <p className="mt-1.5 text-sm text-ink-soft">{tr(lang, `${s.k}.b`, s.body)}</p>
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <button type="button" onClick={close} className="text-ink-soft underline underline-offset-2">{tr(lang, "tour.skip", "Skip")}</button>
          <span className="flex gap-2">
            <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40">{tr(lang, "tour.back", "Back")}</button>
            <button type="button" onClick={() => (last ? close() : setI(i + 1))} className="rounded-lg bg-ink px-3 py-1.5 font-medium text-paper">{last ? tr(lang, "tour.done", "Done") : tr(lang, "tour.next", "Next")}</button>
          </span>
        </div>
      </div>
    </>
  );
}

/** Persistent, quiet replay control. */
export function TourButton({ onClick }: { onClick: () => void }) {
  const lang = useLang();
  return <button type="button" onClick={onClick} className="rounded-lg border border-line bg-paper px-3 py-1 text-xs font-medium text-ink hover:border-ink-soft">{tr(lang, "tour.replay", "Guided tour")}</button>;
}
