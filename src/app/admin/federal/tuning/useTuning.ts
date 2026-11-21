"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";

/** Translate with a fallback, and with {name} placeholders. */
export function useT() {
  const lang = useLang();
  const t = (k: string, en: string) => tr(lang, k, en);
  const tv = (k: string, en: string, v: Record<string, string | number>) => tr(lang, k, en).replace(/\{(\w+)\}/g, (_, n: string) => String(v[n] ?? ""));
  return { lang, t, tv };
}

/** POST to the tuning route, then re-read the page's server data. */
export function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const act = async (label: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(label);
    setError(null);
    setNote(null);
    const res = await fetch("/api/admin/un/tuning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setBusy(null);
    if (!res.ok) { setError(typeof d.error === "string" ? d.error : "The request failed."); return null; }
    router.refresh();
    return d;
  };
  return { busy, error, note, setNote, act };
}
