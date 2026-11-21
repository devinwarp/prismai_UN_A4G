"use client";

import { tr } from "@/lib/un/i18n/dict";
import { useStoredLang } from "@/app/admin/federal/_components/JourneyBar";

/** The header sits outside each page's LangShell, so it follows the stored language like the journey bar. */
export default function SignOut() {
  return <button className="text-ink-soft hover:text-ink">{tr(useStoredLang(), "nav.signout", "Sign out")}</button>;
}
