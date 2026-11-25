import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { mayReadUseCase } from "@/lib/un/federal-read-access";
import { getUserAndProfile } from "@/lib/auth";
import { cyclesToday, DEFAULT_BUDGET, EMPTY_AUTO, heldOutAlignment, modelCallsToday, replayAuto, type AutoState } from "@/lib/un/auto-tune";
import { loadAutoLog } from "@/lib/un/autotune-store";
import { appKbStore } from "@/lib/un/kb-store-app";
import { isUuid } from "@/lib/un/model";
import { permissionsFor } from "@/lib/un/permissions-server";
import { loadAttachedSop } from "@/lib/un/profiles-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { loadState } from "@/lib/un/tuning-service";
import LangShell, { T, TV } from "../../../_components/Lang";
import { card } from "../../../_components/ui";
import { ImproveControls, type Waiting } from "./ImproveControls";

export const metadata: Metadata = { title: "Improve the agent", robots: { index: false, follow: false } };

// who may switch, run or decide can change at any time, and the log changes while a cycle runs: never prerender it
export const dynamic = "force-dynamic";

export default async function ImprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/improve`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  if (!(await mayReadUseCase(profile.org_id, user.id, profile.role, id))) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const perms = await permissionsFor(profile, user.id);

  let state: AutoState = EMPTY_AUTO;
  let storeError: string | null = null;
  try { state = replayAuto(await loadAutoLog(profile.org_id, id)); } catch (e) { storeError = e instanceof Error ? e.message : "The auto-tuning log could not be read"; }
  const sop = await loadAttachedSop(profile.org_id, id);
  const waiting: Waiting[] = sop
    ? (await loadState({ store: appKbStore(profile.org_id), sopId: sop })).versions.filter((v) => v.status === "proposed").map((v) => ({ id: v.id, summary: v.summary, by: v.proposed_by, at: v.proposed_at, held_out_before: heldOutAlignment(v.before), held_out_after: heldOutAlignment(v.after) }))
    : [];

  return (
    <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="im.eyebrow" en="Improve the agent" /></p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><TV k="im.h1" en="Keeping {uc} aligned with what it is expected to do" v={{ uc: uc.ext_id }} /></h1>
        <p className="mt-3 max-w-[68ch] text-base text-ink-soft"><T k="im.lede" en="The agent's job is to match the expected output of every test. A tuning agent works on the gap: it proposes small fixes, checks that nothing gets worse, and, within the limit the business process owner sets, applies the safe ones by itself. It never touches a control, never approves a release, and every change is logged and can be undone." /></p>
        <p className="mt-3 flex flex-wrap gap-4">
          <Link className="text-sm underline" href={`/admin/federal/use-cases/${id}/pilot`}><T k="im.pilot" en="Pilot and verdict" /></Link>
          <Link className="text-sm underline" href="/admin/federal/tuning"><T k="im.board" en="The tuning board (settings, instructions, questions)" /></Link>
          <Link className="text-sm underline" href={`/admin/federal/use-cases/${id}/tuning`}><T k="im.approval" en="Tuning and approval" /></Link>
        </p>
        {storeError ? (
          <section className={`${card} mt-6`}><p role="alert" className="text-sm font-medium">{storeError}</p></section>
        ) : !sop ? (
          <section className={`${card} mt-6`}><p className="text-sm font-medium"><T k="im.nosop" en="Attach an SOP to this use case first: the agent is tuned against its SOP." /></p></section>
        ) : (
          <ImproveControls
            useCaseId={id}
            state={state}
            waiting={waiting}
            mayRun={perms.can("tuning.run", id)}
            maySwitch={perms.can("autotune.switch", id)}
            mayDecide={perms.can("tuning.decide", id)}
            modelCallsToday={modelCallsToday(state)}
            cyclesLeft={Math.max(0, DEFAULT_BUDGET.cyclesPerDay - cyclesToday(state))}
          />
        )}
      </main>
    </LangShell>
  );
}
