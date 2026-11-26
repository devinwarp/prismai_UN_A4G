"use client";

import { useEffect, useId, useRef } from "react";
import SignInForm, { SIGN_IN_COPY } from "@/components/auth/SignInForm";
import type { Lang } from "@/lib/un/i18n/dict";

/**
 * Sign in as a dialog over the landing page. A native <dialog> opened with showModal() gives the focus trap, Escape to close, the backdrop, and
 * returns focus to the button that opened it. The form is mounted only while it is open, so every opening starts empty.
 */
export default function SignInDialog({ open, onClose, lang, judge, closeLabel }: { open: boolean; onClose: () => void; lang: Lang; judge: boolean; closeLabel: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-line bg-card p-6 text-ink shadow-[0_12px_32px_-12px_rgba(28,33,28,0.45)] backdrop:bg-ink/40 sm:p-8"
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="font-display text-3xl font-medium">{SIGN_IN_COPY[lang].title}</h2>
            <button type="button" onClick={onClose} aria-label={closeLabel} className="-me-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:text-ink">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <SignInForm lang={lang} judge={judge} />
        </>
      )}
    </dialog>
  );
}
