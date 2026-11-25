"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { tr } from "@/lib/un/i18n/dict";
import type { UnUseCaseState } from "@/lib/un/model";
import type { HitlConfig } from "@/lib/un/hitl";
import { useLang } from "./Lang";
import { Term } from "./Gloss";
import CitizenMessageCheck from "./CitizenMessageCheck";
import HitlEditor from "../HitlEditor";

type Tab = "hitl" | "message";

/** Entity oversight and citizen-message checks. */
export default function ConfigDrawer({
  canEdit, hitl, useCases, entities, buttonClass,
}: { canEdit: boolean; hitl: HitlConfig; useCases: UnUseCaseState[]; entities: string[]; buttonClass: string }) {
  const lang = useLang();
  const dlg = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const tabs: [Tab, string][] = [
    ...(canEdit ? ([
      ["hitl", tr(lang, "nav.hitl", "Oversight rules")],
    ] as [Tab, string][]) : []),
    ["message", tr(lang, "msg.title", "Citizen message check")],
  ];
  const [tab, setTab] = useState<Tab>(tabs[0][0]);
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const next = (i + (rtl ? -step : step) + tabs.length) % tabs.length;
    e.preventDefault();
    setTab(tabs[next][0]);
    document.getElementById(`${uid}-tab-${tabs[next][0]}`)?.focus();
  };

  const title = canEdit ? tr(lang, "ua.sec.configure", "Configure") : tr(lang, "msg.title", "Citizen message check");
  const panel = (id: Tab, children: ReactNode) => (
    <div key={id} role="tabpanel" id={`${uid}-panel-${id}`} aria-labelledby={`${uid}-tab-${id}`} hidden={tab !== id} className="px-5 py-5 sm:px-6">{children}</div>
  );

  return (
    <>
      <button type="button" onClick={() => dlg.current?.showModal()} className={buttonClass}>{title}</button>
      <dialog
        ref={dlg}
        aria-labelledby={`${uid}-title`}
        {...{ closedby: "any" }}
        className="m-0 ms-auto h-dvh max-h-none w-[min(46rem,100vw)] max-w-none border-s-2 border-ink bg-paper p-0 text-ink backdrop:bg-ink/40 open:flex open:flex-col"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 sm:px-6">
          <h2 id={`${uid}-title`} className="font-display text-xl font-medium tracking-tight">{title}</h2>
          <button type="button" onClick={() => dlg.current?.close()} className="rounded-lg border border-line bg-paper px-3 py-1 text-sm font-medium hover:border-ink-soft">{tr(lang, "hdr.setup.close", "Close")}</button>
        </div>
        {tabs.length > 1 && (
          <div role="tablist" aria-label={title} className="flex gap-1 overflow-x-auto border-b border-line px-5 pt-2 sm:px-6">
            {tabs.map(([id, label], i) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${uid}-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`${uid}-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`-mb-px shrink-0 rounded-t-lg border border-b-0 px-3.5 py-2 text-sm ${tab === id ? "border-line bg-card font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {canEdit && panel("hitl", (
            <>
              <p className="max-w-[68ch] text-sm leading-relaxed text-ink-soft">{tr(lang, "ua.hitl.lede1", "A use case that breaks a rule in force for its entity fails the final-approval check outright; it is never averaged away. Every")} <Term id="oversight">{tr(lang, "ua.hitl.oversight", "oversight")}</Term> {tr(lang, "ua.hitl.lede2", "rule is on unless switched off.")}</p>
              <div className="mt-4"><HitlEditor entities={entities} config={hitl} useCases={useCases} /></div>
            </>
          ))}
          {panel("message", <CitizenMessageCheck bare />)}
        </div>
      </dialog>
    </>
  );
}
