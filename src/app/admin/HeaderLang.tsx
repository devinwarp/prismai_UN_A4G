"use client";

import type { ReactNode } from "react";
import { DIR, tr } from "@/lib/un/i18n/dict";
import { useStoredLang } from "@/app/admin/federal/_components/JourneyBar";

/** The header sits outside each page's LangShell: it follows the stored language (direction and the nav label). */
export function HeaderRow({ children, className }: { children: ReactNode; className: string }) {
  const lang = useStoredLang();
  return <div dir={DIR[lang]} lang={lang} className={className}>{children}</div>;
}

export function FederalLabel() {
  return <>{tr(useStoredLang(), "nav.federal", "Federal")}</>;
}
