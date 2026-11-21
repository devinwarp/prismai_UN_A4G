"use client";

import { useEffect, useRef } from "react";
import type { TraceRecord, Verification } from "@/lib/un/trace";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "./Lang";
import { scrollFocus } from "./ui";

type Rec = Pick<TraceRecord, "trace_id" | "agent" | "step" | "hash" | "signature">;

/** The logbook as a chain: each block holds the fingerprint of the one before it. A broken link is unmistakable and everything after it is marked untrusted. */
export default function Chain({ log, verification }: { log: Rec[]; verification: Verification }) {
  const lang = useLang();
  const bad = verification.ok ? -1 : verification.brokenAt ?? 0;
  const scroller = useRef<HTMLOListElement>(null);
  // A break must be visible without scrolling: centre the broken block in the strip (no page scroll).
  useEffect(() => {
    const el = scroller.current;
    const b = el?.querySelector<HTMLElement>('[data-state="broken"]');
    if (!el || !b) return;
    if (getComputedStyle(el).direction === "rtl") b.scrollIntoView({ inline: "center", block: "nearest" });
    else el.scrollLeft = b.offsetLeft - el.clientWidth / 2 + b.offsetWidth / 2;
  }, [bad, log.length]);
  if (!log.length) {
    return <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">{tr(lang, "chain.empty", "The logbook is empty. The first step you release becomes record 1; every later record is locked to it.")}</p>;
  }
  return (
    <div>
      <div aria-hidden className="mb-2 flex flex-wrap gap-[3px]">
        {log.map((r, i) => <span key={r.trace_id} title={`#${i + 1}`} className="h-2 w-2 rounded-[2px]" style={{ background: i === bad ? "var(--color-ember)" : bad >= 0 && i > bad ? "var(--color-line)" : "var(--color-lit)" }} />)}
      </div>
      <ol ref={scroller} {...scrollFocus} className="chain" aria-label={tr(lang, "chain.label", "Logbook records, oldest first")}>
        <li className="flex items-center">
          <span className="chain-block" data-state="ok" style={{ width: "4.5rem", ["--i" as string]: 0 }}>
            <span className="font-mono text-[10px] tracking-widest text-ink-soft uppercase">{tr(lang, "chain.start", "Start")}</span>
            <span className="mt-1 block font-mono text-[11px]">0000…</span>
          </span>
        </li>
        {log.map((r, i) => {
          const state = i === bad ? "broken" : bad >= 0 && i > bad ? "dim" : "ok";
          return (
            <li key={r.trace_id} className="flex items-center">
              <span className="chain-link" data-broken={i === bad} data-dim={bad >= 0 && i > bad} style={{ ["--i" as string]: i + 1 }} aria-hidden />
              <span className="chain-block" data-state={state} style={{ ["--i" as string]: i + 1 }}>
                <span className="flex items-center justify-between gap-1 font-mono text-[11px]">
                  <span>#{i + 1}</span>
                  <span className={state === "broken" ? "font-medium text-ember" : state === "dim" ? "text-ink-soft" : "text-lit-deep"}>
                    <span aria-hidden>{state === "broken" ? "✕" : state === "dim" ? "?" : "✓"}</span>
                    <span className="sr-only">{state === "broken" ? "link broken" : state === "dim" ? "untrusted" : "link intact"}</span>
                  </span>
                </span>
                <span className="mt-1 block truncate text-xs">{r.agent}</span>
                <span className="block font-mono text-[10px] text-ink-soft">{r.step}{r.signature ? ` · ${tr(lang, "chain.signed", "signed")}` : ""}</span>
                <span className="mt-1 block font-mono text-[11px]" title={r.hash}>{r.hash.slice(0, 8)}…</span>
                {state === "broken" && <span className="mt-1 block text-[11px] font-medium text-ember">{tr(lang, "chain.broken", "Fingerprint no longer matches")}</span>}
                {state === "dim" && <span className="mt-1 block text-[11px]">{tr(lang, "chain.untrusted", "Cannot be trusted")}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={`mt-1 text-sm font-medium ${verification.ok ? "text-lit-deep" : "text-ember"}`}>
        <span aria-hidden>{verification.ok ? "✓" : "✕"}</span>{" "}
        {verification.ok
          ? tr(lang, "chain.ok", `All ${verification.length} records link back to the start. Nothing has been edited.`).replace("{n}", String(verification.length))
          : `${tr(lang, "chain.fail", "Chain broken at record")} ${bad + 1}: ${verification.reason}`}
      </p>
    </div>
  );
}
