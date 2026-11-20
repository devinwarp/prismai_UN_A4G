"use client";

import type { ReactNode } from "react";
import { tr } from "@/lib/un/i18n/dict";
import type { Verdict } from "@/lib/un/model";
import { useLang } from "../../_components/Lang";
import { Term } from "../../_components/Gloss";
import { VERDICT_META, VerdictBadge } from "../../_components/ui";

type Stage = "todo" | "active" | "done";

/** check -> decide -> sign. The links fill as the run advances; every stage also says its state in words. */
export function Pipeline({
  released, total, isGate, done, signed, verdict, signer, actions,
}: { released: number; total: number; isGate: boolean; done: boolean; signed: boolean; verdict: Verdict | null; signer: string | null; actions: ReactNode }) {
  const lang = useLang();
  const check: Stage = done ? "done" : "active";
  const decide: Stage = done ? "done" : released > 0 ? "active" : "todo";
  const sign: Stage = signed ? "done" : done ? "active" : "todo";
  const stages: { n: number; st: Stage; title: ReactNode; line: string }[] = [
    { n: 1, st: check, title: <Term id="gate">{tr(lang, "pipe.check", "Check")}</Term>, line: tr(lang, "pipe.check.l", `${released} of ${total} steps of evidence released`).replace("{a}", String(released)).replace("{b}", String(total)) },
    { n: 2, st: decide, title: <Term id="verdict">{tr(lang, "pipe.decide", "Decide")}</Term>, line: verdict ? tr(lang, `verdict.${verdict}`, verdict.replace("_", " ")) : tr(lang, "pipe.decide.l", "Waiting for evidence") },
    ...(isGate ? [{ n: 3, st: sign, title: <Term id="signature">{tr(lang, "pipe.sign", "Sign")}</Term>, line: signed ? tr(lang, "pipe.signed", `Signed by ${signer ?? "a person"}`).replace("{who}", signer ?? "") : done ? tr(lang, "pipe.sign.now", "Your turn: a person signs") : tr(lang, "pipe.sign.l", "A person signs at the end") }] : []),
  ];
  return (
    <div data-tour="pipeline" className="fx-rise rounded-2xl border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <ol className="flex min-w-0 flex-1 basis-[28rem] items-start gap-2" aria-label={tr(lang, "pipe.label", "How a decision is made")}>
          {stages.map((s, i) => (
            <li key={s.n} className="flex min-w-0 flex-1 items-start gap-2 last:flex-none last:basis-auto">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-base font-medium">
                  <span className="pipe-dot relative inline-flex h-7 w-7 items-center justify-center rounded-full border font-mono text-xs" data-state={s.st}
                    style={{ borderColor: s.st === "todo" ? "var(--color-line)" : "var(--color-lit)", background: s.st === "done" ? "var(--color-lit)" : "transparent", color: s.st === "done" ? "var(--color-paper)" : "var(--color-ink)" }}>
                    <span aria-hidden>{s.st === "done" ? "✓" : s.n}</span>
                    {s.st === "active" && <span aria-hidden className="fx-ring absolute inset-0 rounded-full border border-lit" />}
                  </span>
                  {s.title}
                  <span className="sr-only">{s.st}</span>
                </p>
                <p className="mt-1 ps-9 text-sm text-ink-soft">{s.line}</p>
              </div>
              {i < stages.length - 1 && <span aria-hidden className="pipe-link mt-3.5 min-w-6" data-on={i === 0 ? released > 0 : done}><i /></span>}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
      </div>
    </div>
  );
}

/** The verdict moment: re-keyed on every released step so the stamp replays; static under reduced motion. */
export function VerdictHero({
  step, verdict, prev, reasons, expectedOk,
}: { step: string; verdict: Verdict; prev: Verdict | null; reasons: string[]; expectedOk: boolean | null }) {
  const lang = useLang();
  const m = VERDICT_META[verdict];
  const moved = prev && prev !== verdict;
  return (
    <section key={step} aria-label={tr(lang, "hero.label", "Current decision")} data-tour="verdict" className="rounded-2xl border-2 bg-card p-6 sm:p-8" style={{ borderColor: `color-mix(in srgb, ${m.color} 60%, transparent)` }}>
      <p className="font-mono text-[11px] tracking-[0.22em] text-ink-soft uppercase">{tr(lang, "hero.after", "Decision after")} {step}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="fx-stamp relative"><VerdictBadge verdict={verdict} size="lg" /></div>
        {moved && prev && (
          <p className="fx-fade text-sm text-ink-soft">
            <span className="font-mono">{prev.replace("_", " ")}</span> <span aria-hidden className="rtl:rotate-180 inline-block">→</span> <span className="font-medium text-ink">{tr(lang, `verdict.${verdict}`, verdict.replace("_", " "))}</span>
          </p>
        )}
        {expectedOk !== null && <p className={`fx-fade text-sm font-medium ${expectedOk ? "text-lit-deep" : "text-ember"}`}><span aria-hidden>{expectedOk ? "✓" : "✕"}</span> {expectedOk ? tr(lang, "hero.as_expected", "As the scenario expected") : tr(lang, "hero.unexpected", "Not what the scenario expected")}</p>}
      </div>
      <p className="font-display mt-4 max-w-[52ch] text-2xl leading-snug sm:text-3xl">{tr(lang, `hero.say.${verdict}`, m.hint)}.</p>
      {reasons[0] && <p className="mt-3 max-w-[68ch] text-base text-ink-soft"><span className="font-medium text-ink">{tr(lang, "hero.because", "Because")}</span> {reasons[0]}</p>}
    </section>
  );
}
