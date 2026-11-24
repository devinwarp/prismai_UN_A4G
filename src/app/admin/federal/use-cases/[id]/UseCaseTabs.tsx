"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { DIR, tr } from "@/lib/un/i18n/dict";
import { TABS, tabFor, type TabId } from "@/lib/un/use-case-tabs";
import { useStoredLang } from "../../_components/JourneyBar";

const EN: Record<TabId, string> = { overview: "Overview", setup: "Setup", pilot: "Pilot", tuning: "Tuning", production: "Production" };

/** Five tabs over the use case's existing pages. The active tab follows the route segment; every tab is a plain link. */
export default function UseCaseTabs({ base }: { base: string }) {
  const lang = useStoredLang();
  const active = tabFor(useSelectedLayoutSegment());
  return (
    <nav dir={DIR[lang]} lang={lang} aria-label={tr(lang, "tabs.label", "Use case sections")} className="mx-auto mt-3 max-w-6xl overflow-x-auto px-4 sm:px-6">
      <ul className="flex min-w-max gap-5 border-b border-line text-sm">
        {TABS.map((t) => (
          <li key={t.id}>
            <Link
              href={base + t.href}
              aria-current={t.id === active ? "page" : undefined}
              className={`inline-block pb-2 focus-visible:outline-2 focus-visible:outline-lit ${t.id === active ? "border-b-2 border-ink font-medium text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {tr(lang, `tabs.${t.id}`, EN[t.id])}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
