"use client";

import { DEFAULT_POLICY, deadlineText, type Policy } from "@/lib/un/model";
import { tr, type Lang } from "@/lib/un/i18n/dict";
import { useLang } from "./Lang";

type P = Pick<Policy, "deadline" | "source_url">;

/** Translation of deadlineText (the engine helper returns English only). English is byte-identical. */
export function deadlineNote(lang: Lang, p: P): string {
  if (lang !== "ar" || !p.deadline) return deadlineText(p);
  const assumed = p.deadline === DEFAULT_POLICY.deadline && p.source_url === DEFAULT_POLICY.source_url;
  return assumed
    ? ` ${tr(lang, "ua.deadline.assumed", "by about April 2028 (two years from 23 Apr 2026, assumed)")}`
    : ` ${tr(lang, "ua.deadline.by", "by {d}").replace("{d}", `⁦${p.deadline}⁩`)}`;
}

export function useDeadlineNote(p: P) {
  return deadlineNote(useLang(), p);
}

export function DeadlineNote({ policy }: { policy: P }) {
  return <>{useDeadlineNote(policy)}</>;
}
