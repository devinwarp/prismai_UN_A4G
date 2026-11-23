import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { isUuid } from "@/lib/un/model";
import { permissionsFor } from "@/lib/un/permissions-server";
import { loadAttachedSop, loadProfileRows } from "@/lib/un/profiles-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { profilesOf } from "@/lib/un/sop/data";
import { loadTestLog, requiredFor } from "@/lib/un/test-set-store";
import { replayTestSet, review, verifyTest } from "@/lib/un/test-sets";
import { loadParamLog } from "@/lib/un/verdict-param-store";
import { DEFAULT_PARAMS, FLOORS, replayParams, verifyParams } from "@/lib/un/verdict-params";
import LangShell, { T, TV } from "../../../_components/Lang";
import { card } from "../../../_components/ui";
import { TestgenPanel } from "./TestgenPanel";
import { ParamsPanel, TestSetEditor } from "./TestSetEditor";
import { replayGen, testgenModel, verifyGen } from "@/lib/un/testgen";
import { loadGenLog } from "@/lib/un/testgen-store";

export const metadata: Metadata = { title: "Pilot tests and parameters", robots: { index: false, follow: false } };

export default async function TestsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ profile?: string }> }) {
  const [{ id }, { profile: pick }] = await Promise.all([params, searchParams]);
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/tests`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const perms = await permissionsFor(profile, user.id);
  const mayEdit = perms.can("scenario.edit", id);
  const mayApprove = perms.can("scenario.approve", id);
  const mayPropose = perms.can("scenario.propose", id);

  const sopId = await loadAttachedSop(profile.org_id, id);
  const names = new Set(sopId ? (await loadProfileRows(profile.org_id, id, sopId)).filter((r) => r.automate).map((r) => r.profile) : []);
  const profiles = ((sopId && profilesOf(sopId)) || []).filter((p) => names.has(p.name));
  const current = profiles.find((p) => p.name === pick) ?? profiles[0] ?? null;

  let body = null;
  if (current) {
    const need = await requiredFor(profile.org_id, id, current.name);
    if (need.ok) {
      const log = await loadTestLog(profile.org_id, id, current.name);
      const state = replayTestSet(log);
      const plog = await loadParamLog(profile.org_id, id, current.name);
      const pstate = replayParams(plog);
      let glog: Awaited<ReturnType<typeof loadGenLog>> = [];
      let genError: string | null = null;
      try { glog = await loadGenLog(profile.org_id, id, current.name); } catch (e) { genError = e instanceof Error ? e.message : "The proposal log could not be read"; }
      const approvers = (await approversForUseCase(profile.org_id, id)).map((a) => ({ title: a.title, source: a.source }));
      body = (
        <>
          <TestSetEditor
            useCaseId={id}
            profile={current.name}
            state={state}
            review={review(state, need.required)}
            chain={verifyTest(log)}
            tasks={current.tasks.map((t) => ({ id: t.id, title: t.title, client_facing: t.flags.client_facing }))}
            approvers={approvers}
            mayEdit={mayEdit}
            mayApprove={mayApprove}
            userId={user.id}
          />
          <TestgenPanel
            useCaseId={id}
            profile={current.name}
            state={replayGen(glog, state.blueprints)}
            chain={verifyGen(glog)}
            tasks={current.tasks.map((t) => ({ id: t.id, title: t.title }))}
            model={testgenModel()}
            mayPropose={mayPropose}
            mayEdit={mayEdit}
            storeError={genError}
          />
          <ParamsPanel
            useCaseId={id}
            profile={current.name}
            state={pstate}
            chain={verifyParams(plog)}
            floors={FLOORS}
            defaults={DEFAULT_PARAMS}
            approvers={approvers}
            mayEdit={mayEdit}
            mayApprove={mayApprove}
            userId={user.id}
          />
        </>
      );
    }
  }

  return (
    <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="ts.eyebrow" en="Pilot tests and parameters" /></p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><TV k="ts.h1" en="How {uc} is tested before it runs" v={{ uc: uc.ext_id }} /></h1>
        <p className="mt-3 max-w-[68ch] text-base text-ink-soft"><T k="ts.lede" en="The tests come from the skill of each job profile. The process owner adds, changes or retires scenarios and sets the thresholds; a person approves both, and the pilot is judged only against what was approved." /></p>
        <p className="mt-3 flex flex-wrap gap-4"><Link className="text-sm underline" href={`/admin/federal/use-cases/${id}/sop`}><T k="ts.back" en="Back to the SOP and job profiles" /></Link><Link className="text-sm underline" href={`/admin/federal/use-cases/${id}/targets`}><T k="tg2.link" en="Process targets" /></Link><Link className="text-sm underline" href={`/admin/federal/use-cases/${id}/pilot${current ? `?profile=${encodeURIComponent(current.name)}` : ""}`}><T k="ts.pilot" en="Pilot and verdict" /></Link></p>

        {!sopId || profiles.length === 0 ? (
          <section className={`${card} mt-6`}><p className="text-sm font-medium"><T k="ts.none" en="Attach an SOP and tick Automate on a job profile first: tests are written for the agent that will do its work." /></p></section>
        ) : (
          <>
            <nav aria-label="Job profile" className="mt-6 flex flex-wrap gap-2">
              {profiles.map((p) => (
                <Link key={p.name} href={`/admin/federal/use-cases/${id}/tests?profile=${encodeURIComponent(p.name)}`} aria-current={p.name === current?.name ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${p.name === current?.name ? "border-ink font-medium" : "border-line"}`}>{p.name}</Link>
              ))}
            </nav>
            {body}
          </>
        )}
      </main>
    </LangShell>
  );
}
