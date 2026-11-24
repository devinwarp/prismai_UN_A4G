"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { DIR, tr } from "@/lib/un/i18n/dict";
import type { Verdict } from "@/lib/un/model";
import { VERDICT_META, verdictName } from "../../_components/labels";
import { quadLabel, stageLabel } from "../../_components/labels";
import { useStoredLang } from "../../_components/JourneyBar";

export interface HeaderUc { ext_id: string; entity: string; title: string; quadrant: string; client_facing: boolean; verdict: Verdict | null; stage: string; compliant: boolean }

/** Who and where this use case is, on top of every use-case page: the back links, id and entity, verdict, stage, compliance. The title
 * is shown here on the overview only; the other pages carry their own heading. */
export default function UseCaseHeader({ uc }: { uc: HeaderUc }) {
  const lang = useStoredLang();
  const overview = useSelectedLayoutSegment() === null;
  const m = uc.verdict ? VERDICT_META[uc.verdict] : null;
  return (
    <header dir={DIR[lang]} lang={lang} className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
      <p className="flex flex-wrap gap-x-4 text-sm">
        <Link href="/admin/federal" className="text-ink-soft underline underline-offset-2"><span className="inline-block rtl:rotate-180">←</span> {tr(lang, "uc.sj.back", "Federal dashboard")}</Link>
        <Link href="/admin/federal/evals" className="underline underline-offset-4">{tr(lang, "uc.pg.all", "All use cases side by side")}</Link>
      </p>
      <p className="mt-3 font-mono text-xs text-ink-soft"><bdi dir="ltr">{uc.ext_id}</bdi> · {uc.entity} · {quadLabel(lang, uc.quadrant)}{uc.client_facing ? ` · ${tr(lang, "uc.sj.client", "client-facing")}` : ""}</p>
      {overview && <h1 className="font-display mt-1 text-3xl font-medium tracking-tight sm:text-4xl">{uc.title}</h1>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 font-mono text-xs tracking-wide whitespace-nowrap">
          <span aria-hidden style={{ color: m?.color ?? "var(--color-ink-soft)" }}>{m?.glyph ?? "–"}</span>
          <span>{verdictName(lang, uc.verdict)}</span>
        </span>
        <span className="text-ink-soft">{tr(lang, "uc.sj.stage", "stage")} <span className="font-mono text-ink">{stageLabel(lang, uc.stage)}</span></span>
        <span className="text-ink-soft">{uc.compliant ? tr(lang, "uc.sj.compliant", "✓ compliant and aligned") : tr(lang, "uc.sj.notcompliant", "not yet compliant")}</span>
      </div>
    </header>
  );
}
