import Link from "next/link";
import type { ReactNode } from "react";
import { countryHref } from "@/lib/un/country-context";
import AdminHeader from "../../AdminHeader";
import LangShell, { LangBar, T } from "./Lang";
import { Ct } from "./b-bits";
import { scrollRegion } from "./ui";

export default function ToolWorkspace({ country, scopeLabel, orgName, viewer, title, description, children, backEntity }: {
  country?: { id: string; name: string };
  backEntity?: string;
  scopeLabel?: ReactNode;
  orgName?: string | null;
  viewer: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="conduit-bg flex min-h-dvh flex-col desk:h-dvh">
      <div className="shrink-0"><AdminHeader active="federal" orgName={orgName} viewer={viewer} dense /></div>
      <LangShell bare>
        <main data-country={country?.id} className="mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 desk:min-h-0 desk:max-w-[108rem] short:gap-3 short:py-3">
          <header className="shrink-0 space-y-3 short:space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-sm">
              <Link href={country ? countryHref("/admin/federal", country.id, backEntity) : "/admin/federal"} className="underline decoration-line underline-offset-4 hover:decoration-ink"><T k="sop.back" en="Back to the dashboard" /></Link>
              <div className="flex flex-wrap items-center gap-2.5">
                {(country || scopeLabel) && <span className="font-medium text-ink">{country ? <Ct id={country.id} en={country.name} /> : scopeLabel}</span>}
                <LangBar />
              </div>
            </div>
            <div>
              <h1 className="font-display text-3xl font-medium leading-tight tracking-tight">{title}</h1>
              {description && <div className="mt-1 max-w-[100ch] text-sm leading-relaxed text-ink-soft">{description}</div>}
            </div>
          </header>
          {children}
        </main>
      </LangShell>
    </div>
  );
}

export function WorkspacePane({ title, id, children }: { title: ReactNode; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col rounded-xl border border-line bg-card desk:min-h-0 desk:flex-1">
      <h2 id={id} className="shrink-0 border-b border-line px-4 py-3 font-display text-xl font-medium">{title}</h2>
      <div {...scrollRegion(id)} className="min-w-0 p-4 desk:min-h-0 desk:flex-1 desk:overflow-auto">
        {children}
      </div>
    </section>
  );
}
