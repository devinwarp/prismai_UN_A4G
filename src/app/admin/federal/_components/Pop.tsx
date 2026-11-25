"use client";

import { useId, useRef, type ReactNode } from "react";

/**
 * A button and the native popover it opens: top layer, so it is never clipped by a panel that scrolls, closes on Esc and on a click
 * outside, and returns focus to the button. Placed against the button each time it opens (fixed, in logical inline-end alignment).
 * Not a modal: the page behind stays usable.
 */
export default function Pop({
  label, buttonClass, panelClass = "", above, dataTour, children,
}: { label: ReactNode; buttonClass: string; panelClass?: string; /** Open above the button (for a control at the foot of a panel). Left out, it opens on the side with more room. */ above?: boolean; dataTour?: string; children: ReactNode }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const place = (el: HTMLElement) => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const edge = rtl ? r.left : window.innerWidth - r.right;
    el.style.insetInlineEnd = `${Math.max(8, Math.min(edge, window.innerWidth - 16))}px`;
    const up = above ?? (window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom);
    if (up) { el.style.top = "auto"; el.style.bottom = `${window.innerHeight - r.top + 8}px`; el.style.maxHeight = `${r.top - 24}px`; }
    else { el.style.bottom = "auto"; el.style.top = `${r.bottom + 8}px`; el.style.maxHeight = `${window.innerHeight - r.bottom - 24}px`; }
  };
  return (
    <>
      <button ref={btn} type="button" popoverTarget={id} data-tour={dataTour} className={buttonClass}>{label}</button>
      <div
        id={id}
        popover="auto"
        onToggle={(e) => { if ((e as unknown as { newState: string }).newState === "open") place(e.currentTarget); }}
        className={`m-0 overflow-y-auto rounded-xl border border-ink bg-card p-4 text-ink shadow-[0_12px_32px_-12px_color-mix(in_srgb,var(--color-ink)_45%,transparent)] [inset:auto] ${panelClass}`}
      >
        {children}
      </div>
    </>
  );
}
