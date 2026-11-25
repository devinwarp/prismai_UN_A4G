import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { mayReadUseCase } from "@/lib/un/federal-read-access";
import { getUserAndProfile } from "@/lib/auth";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { isUuid } from "@/lib/un/model";
import { permissionsFor } from "@/lib/un/permissions-server";
import { loadUseCase } from "@/lib/un/sijil-store";
import { loadGoalsResolved, loadTargetLog } from "@/lib/un/target-store";
import { EMPTY_TARGETS, replayTargets, verifyTargets, type TargetEntry } from "@/lib/un/targets";
import LangShell, { T, TV } from "../../../_components/Lang";
import { TargetsEditor } from "./TargetsEditor";

export const metadata: Metadata = { title: "Process targets", robots: { index: false, follow: false } };

// who proposes or approves can change at any time: never prerender it
export const dynamic = "force-dynamic";

export default async function TargetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/targets`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  if (!(await mayReadUseCase(profile.org_id, user.id, profile.role, id))) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const perms = await permissionsFor(profile, user.id);
  let log: TargetEntry[] = [];
  let storeError: string | null = null;
  try { log = await loadTargetLog(profile.org_id, id); } catch (e) { storeError = e instanceof Error ? e.message : "The target log could not be read"; }
  const { goals, source } = await loadGoalsResolved(profile.org_id, uc.entity);
  const approvers = (await approversForUseCase(profile.org_id, id)).map((a) => ({ title: a.title, source: a.source }));

  return (
    <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="tg2.eyebrow" en="Process targets" /></p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><TV k="tg2.h1" en="What {uc} commits to deliver" v={{ uc: uc.ext_id }} /></h1>
        <p className="mt-3 max-w-[68ch] text-base text-ink-soft"><T k="tg2.page.lede" en="Each target contributes to a goal of the entity and says how it is measured. The pilot is judged against the verdict parameters; these targets are what those parameters are meant to prove." /></p>
        <p className="mt-3 flex flex-wrap gap-4"><Link className="text-sm underline" href="/admin/federal/goals"><T k="tg2.all" en="All entity goals and targets" /></Link><Link className="text-sm underline" href={`/admin/federal/use-cases/${id}/tests`}><T k="tg2.tests" en="Pilot tests and parameters" /></Link></p>
        <TargetsEditor
          useCaseId={id}
          entity={uc.entity}
          goals={goals}
          goalsSource={source}
          state={storeError ? EMPTY_TARGETS : replayTargets(log)}
          chain={verifyTargets(log)}
          approvers={approvers}
          mayEdit={perms.can("scenario.edit", id)}
          mayApprove={perms.can("scenario.approve", id)}
          userId={user.id}
          storeError={storeError}
        />
      </main>
    </LangShell>
  );
}
