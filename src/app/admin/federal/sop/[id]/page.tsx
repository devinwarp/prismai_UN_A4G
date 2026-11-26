import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadFederalReadAccess } from "@/lib/un/federal-read-access";
import { getUserAndProfile } from "@/lib/auth";
import { countryHref } from "@/lib/un/country-context";
import { entityCountryOf } from "@/lib/un/country";
import { loadFederalCountry } from "@/lib/un/federal-country";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import { loadUseCaseSopDocument } from "@/lib/un/sop-version-store";
import AdminHeader from "../../../AdminHeader";
import LangShell, { LangBar, T, TV } from "../../_components/Lang";
import { btnGhost, card } from "../../_components/ui";
import SopReader from "./SopReader";
import "./reader.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Read SOP", robots: { index: false, follow: false } };

export default async function SopReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/sop/${id}`);
  if (!profile?.org_id) redirect("/login");

  const orgId = profile.org_id;
  const access = await loadFederalReadAccess(orgId, user.id, profile.role);
  if (!access.allCases && !access.caseIds.has(id)) notFound();
  const useCase = await loadUseCase(orgId, id);
  if (!useCase) notFound();

  const { state } = await loadFederalCountry(orgId, undefined, false);
  const country = entityCountryOf(state, useCase.entity);
  const { attachedId, version, sampleId, attached, sample } = await loadUseCaseSopDocument(orgId, useCase);
  const title = attached?.title ?? sample?.title;
  const source = attached?.body ?? sample?.text;
  const fileId = (attachedId ?? sampleId ?? useCase.ext_id).replace(/[^\p{L}\p{N}_.-]+/gu, "-");
  const fileName = `${fileId}-${attached ? `v${version}` : "sample"}.md`;

  return (
    <div className="sop-reader-shell conduit-bg flex flex-col">
      <div className="shrink-0 print:hidden"><AdminHeader active="federal" viewer={profile.role === "viewer"} dense /></div>
      <LangShell bare>
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pt-5 sm:px-6 desk:min-h-0 desk:max-w-[108rem] desk:pt-4">
          <header className="mb-4 shrink-0 short:mb-2">
            <nav className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden short:mb-1" aria-label="SOP">
              <Link href={countryHref("/admin/federal", country)} className="text-sm underline decoration-line underline-offset-4 hover:decoration-ink">
                <T k="sop.back" en="Back to the dashboard" />
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                {access.allCases && <Link href={countryHref("/admin/federal/sop", country)} className={`${btnGhost} px-3 py-1 text-xs`}>
                  <T k="uc.sop.intake" en="Procedure intake" />
                </Link>}
                <Link href={`/admin/federal/use-cases/${id}/sop#sop-setup`} className={`${btnGhost} px-3 py-1 text-xs`}>
                  <T k="tabs.setup" en="Setup" />
                </Link>
                <LangBar />
              </div>
            </nav>
            <h1 className="font-display text-3xl leading-tight font-medium tracking-tight" dir="auto">
              {title ?? <T k="sop.source" en="Source text" />}
            </h1>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
              <li><bdi dir="ltr">{useCase.ext_id}</bdi> · <bdi dir="auto">{useCase.entity}</bdi></li>
              {sample && <li><T k="pf.sop.sample_text" en="Shipped sample. It is not attached to this use case." /></li>}
              {attached && <li><TV k="pf.sop.attached_version" en="Attached version {v}" v={{ v: version }} /></li>}
            </ul>
          </header>
          {source?.trim() ? <SopReader key={fileName} source={source} fileName={fileName} /> : (
            <p className={`${card} text-sm text-ink-soft`}>
              {attachedId
                ? <T k="pf.sop.source.unavailable" en="The attached SOP text is unavailable." />
                : <T k="pf.noattach" en="No SOP is attached to this use case." />}
            </p>
          )}
        </main>
      </LangShell>
    </div>
  );
}
