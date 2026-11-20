"use client";

import { useEffect, useRef, useState } from "react";
import { chainHashes, firstBroken } from "@/lib/un/landing/chain";
import type { Copy } from "@/lib/un/landing/copy";
import { track } from "@/lib/track";

const PENDING = "·".repeat(10);

/** Six chained records with live SHA-256. Edit any word: that record and every later one stop matching the seal. */
export default function Logbook({ c }: { c: Copy }) {
  const [texts, setTexts] = useState<string[]>(c.records);
  const [sealed, setSealed] = useState<string[]>([]);
  const [live, setLive] = useState<string[]>([]);
  const touched = useRef(false);

  useEffect(() => {
    setTexts(c.records); // eslint-disable-line react-hooks/set-state-in-effect -- reset when the language changes
    chainHashes(c.records).then(setSealed);
  }, [c.records]);

  useEffect(() => {
    let stale = false;
    chainHashes(texts).then((h) => !stale && setLive(h));
    return () => {
      stale = true;
    };
  }, [texts]);

  const ready = sealed.length === texts.length && live.length === texts.length;
  const bad = ready ? firstBroken(sealed, live) : -1;
  const edit = (i: number, v: string) => {
    if (!touched.current) {
      touched.current = true;
      track("logbook_edit");
    }
    setTexts((t) => t.map((x, j) => (j === i ? v : x)));
  };
  const tamper = () => {
    track("logbook_tamper_button");
    setTexts((t) => t.map((x, j) => (j === 2 ? x.replace(c.tamperFrom, c.tamperTo) : x)));
  };

  return (
    <section aria-labelledby="logbook-h" className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <h2 id="logbook-h" className="font-display text-xl font-medium sm:text-2xl">{c.logTitle}</h2>
      <p className="mt-1 text-sm text-ink-soft">{c.logHint}</p>
      <ol className="mt-4">
        {texts.map((t, i) => {
          const state = !ready ? "wait" : bad < 0 || i < bad ? "ok" : i === bad ? "edited" : "broken";
          const broken = state === "edited" || state === "broken";
          return (
            <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-x-3">
              <div className="flex flex-col items-center" aria-hidden="true">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border font-mono text-xs ${broken ? "border-ember text-ember" : "border-line text-ink-soft"}`}>{i + 1}</span>
                {i < texts.length - 1 && <span className={`w-px grow ${broken ? "border-s border-dashed border-ember" : "bg-line"}`} />}
              </div>
              <div className="pb-3">
                <label htmlFor={`rec-${i}`} className="sr-only">{c.logAria(i + 1)}</label>
                <textarea
                  id={`rec-${i}`}
                  rows={Math.max(2, Math.ceil(t.length / 30))}
                  value={t}
                  onChange={(e) => edit(i, e.target.value.replace(/\n/g, " "))}
                  spellCheck={false}
                  className="block w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-[15px] leading-snug text-ink outline-none hover:border-line focus:border-lit [field-sizing:content]"
                />
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 px-2 font-mono text-[11px] text-ink-soft">
                  <span className={broken ? "font-medium text-ember" : ""}>
                    {state === "ok" ? `✓ ${c.logSealed}` : state === "edited" ? `✎ ${c.logEdited}` : state === "broken" ? `✕ ${c.logBroken}` : " "}
                  </span>
                  <span dir="ltr" aria-label={c.logHash}>{ready ? live[i].slice(0, 10) : PENDING}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className={`min-h-[3.2em] text-sm ${bad >= 0 ? "font-medium text-ember" : "text-ink-soft"}`}>
        {ready ? (bad >= 0 ? c.logBad(bad + 1) : c.logOk) : " "}
      </p>
      <button
        type="button"
        onClick={bad >= 0 ? () => setTexts(c.records) : tamper}
        className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-ink px-4 text-sm font-medium text-ink hover:bg-paper-deep"
      >
        {bad >= 0 ? c.logRestore : c.logTamper}
      </button>
    </section>
  );
}
