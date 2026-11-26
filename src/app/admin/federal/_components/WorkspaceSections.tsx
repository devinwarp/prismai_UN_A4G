"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "./Lang";
import { scrollRegion } from "./ui";

type WorkspaceSection = { id: string; label: ReactNode; content: ReactNode; anchors?: string[] };

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

const readHash = () => window.location.hash.slice(1);
const initialHash = () => "";

/** Keep panels mounted so a reviewer can consult another section midway through editing. */
export default function WorkspaceSections({ sections, defaultSection }: { sections: WorkspaceSection[]; defaultSection?: string }) {
  const lang = useLang();
  const hash = useSyncExternalStore(subscribeToHash, readHash, initialHash);
  const selected = sections.find((s) => s.id === hash || s.anchors?.includes(hash))
    ?? sections.find((s) => s.id === defaultSection) ?? sections[0];

  useEffect(() => {
    if (hash && selected?.anchors?.includes(hash)) document.getElementById(hash)?.scrollIntoView({ block: "nearest" });
  }, [hash, selected]);

  if (!selected) return null;
  return (
    <div className="grid min-w-0 items-stretch gap-3 desk:min-h-0 desk:flex-1 desk:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label={tr(lang, "workspace.sections", "Workspace sections")} className="min-w-0 rounded-xl border border-line bg-paper-deep p-2 desk:min-h-0 desk:overflow-auto">
        <ul className="flex flex-wrap gap-1 desk:flex-col">
          {sections.map((section) => (
            <li key={section.id} className="min-w-0">
              <a id={`workspace-link-${section.id}`} href={`#${section.id}`} aria-current={section.id === selected.id ? "location" : undefined} className="flex min-h-10 items-center rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-ink-soft [overflow-wrap:anywhere] hover:bg-card hover:text-ink aria-[current=location]:border-line aria-[current=location]:bg-card aria-[current=location]:text-ink">
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {sections.map((section) => (
        <div key={section.id} hidden={section.id !== selected.id} {...scrollRegion(`workspace-link-${section.id}`)} className="min-w-0 rounded-xl border border-line bg-card p-4 sm:p-5 desk:min-h-0 desk:overflow-auto short:p-4">
          {section.content}
        </div>
      ))}
    </div>
  );
}
