"use client";

import Link from "next/link";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { DIR, tr } from "@/lib/un/i18n/dict";
import { STAGE_IDS, type Journey, type StageId } from "@/lib/un/journey";
import { COLOR, GLYPH, SEGMENT, STAGE_EN, stageHref, useStoredLang } from "../../_components/JourneyBar";

/** The nine stages as one thin row: a glyph each (and the state in words for a screen reader), every stage a link. The full journey
 * bar stays on the pages that still use it. */
export default function StageStrip({ base, journey }: { base: string; journey: Journey }) {
  const lang = useStoredLang();
  const seg = useSelectedLayoutSegment();
  const q = useSearchParams().get("stage");
  const sel: StageId = (STAGE_IDS as readonly string[]).includes(q ?? "") ? (q as StageId) : SEGMENT[seg ?? ""] ?? "verdict";
  return (
    <div dir={DIR[lang]} lang={lang} className="border-b border-line bg-paper/60">
      <nav aria-label={tr(lang, "jb.label", "Journey from SOP to production")} className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
        <p className="text-xs text-ink-soft">
          {tr(lang, "jb.counter", "{d} of 9 stages done, {w} waiting for someone").replace("{d}", String(journey.done)).replace("{w}", String(journey.waiting))}
        </p>
        <ol className="flex flex-wrap items-center gap-1">
          {journey.stages.map((s) => {
            const name = tr(lang, `jb.stage.${s.id}`, STAGE_EN[s.id]);
            const state = tr(lang, `jb.state.${s.state}`, s.state);
            return (
              <li key={s.id}>
                <Link
                  href={stageHref(base, s.id)}
                  title={`${s.n}. ${name}: ${state}`}
                  aria-current={s.id === sel ? "step" : undefined}
                  className={`inline-flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-lit ${s.state === "not_yet" ? "border-dashed" : ""} ${s.id === sel ? "ring-2 ring-ink" : ""}`}
                  style={{ borderColor: COLOR[s.state], color: COLOR[s.state] }}
                >
                  <span aria-hidden>{GLYPH[s.state]}</span>
                  <span className="sr-only">{`${s.n}. ${name}: ${state}`}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
