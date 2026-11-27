import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { mayReadUseCase } from "@/lib/un/federal-read-access";
import { getUserAndProfile } from "@/lib/auth";
import { isUuid } from "@/lib/un/model";
import { loadGov } from "@/lib/un/gates-store";
import { loadAttachedSop, loadProfileRows } from "@/lib/un/profiles-store";
import { getVersion, latestOf, loadAttachment, loadChangeRequests, profilesForUseCase } from "@/lib/un/sop-version-store";
import { permissionsFor } from "@/lib/un/permissions-server";
import { RULESETS } from "@/lib/un/rulesets";
import { loadUseCase } from "@/lib/un/sijil-store";
import { checkSopKbFor } from "@/lib/un/sop-kb-app";
import { sampleInput, sampleSopIdForUseCase, SAMPLES } from "@/lib/un/sop/data";
import { assessProfiles, EVIDENCE_KEYS } from "@/lib/un/sop/profiles";
import LangShell, { T, TV } from "../../../_components/Lang";
import { btnGhost, card, scrollRegion, VerdictBadge } from "../../../_components/ui";
import { AttachButton, AutomateBox } from "./ProfileControls";
import { SopEditor } from "./SopEditor";
import SopStructure from "./SopStructure";

export const metadata: Metadata = { title: "SOP and job profiles", robots: { index: false, follow: false } };

const KEY: Record<string, string> = { "uae-federal": "uae", "eu-ai-act": "eu", "sg-imda": "sg" };
const SHORT: Record<string, string> = { "uae-federal": "UAE federal", "eu-ai-act": "EU AI Act", "sg-imda": "Singapore IMDA" };
const EV_EN = { all_pass: "All gates pass", one_fix: "One fix declared", hosting_fails: "Hosting gate fails", no_evidence: "No evidence" } as const;
const FLAG_EN = { client_facing: "client-facing", affects_rights: "rights-affecting", irreversible: "irreversible" } as const;
const FLAG_KEY = { client_facing: "pf.cf", affects_rights: "pf.ra", irreversible: "pf.ir" } as const;

export default async function UseCaseSopPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ j?: string; view?: string }> }) {
  const [{ id }, { j, view }] = await Promise.all([params, searchParams]);
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/sop`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  if (!(await mayReadUseCase(profile.org_id, user.id, profile.role, id))) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const canEdit = profile.role === "admin";
  const sopId = await loadAttachedSop(profile.org_id, id);
  // the SOP is read by version: this use case is on one, a deployed one is frozen on it, and a newer one may be waiting
  const att = await loadAttachment(profile.org_id, id).catch(() => null);
  const version = att?.version ?? (sopId ? 1 : null);
  const [latest, profiles] = sopId ? await Promise.all([
    latestOf(profile.org_id, sopId).catch(() => null),
    profilesForUseCase(profile.org_id, id, sopId),
  ]) : [null, []];
  const attachedDoc = sopId && version !== null
    ? latest?.version === version ? latest : await getVersion(profile.org_id, sopId, version).catch(() => null)
    : null;
  const sampleId = sopId ? null : sampleSopIdForUseCase(uc);
  const sampleDoc = sampleId ? sampleInput(sampleId) : null;
  const document = attachedDoc ? { title: attachedDoc.title, text: attachedDoc.body } : sampleDoc;
  const frozen = uc.stage === "deployed";
  const open = (await loadChangeRequests(profile.org_id).catch(() => [])).filter((r) => r.use_case_id === id && r.status === "open").at(-1) ?? null;
  const perms = await permissionsFor(profile, user.id);
  const rows = sopId ? await loadProfileRows(profile.org_id, id, sopId) : [];
  const ticked = new Set(rows.filter((r) => r.automate).map((r) => r.profile));
  const rs = RULESETS.find((r) => KEY[r.id] === j) ?? RULESETS[0];
  const a = assessProfiles(profiles ?? [], ticked, rs, uc.entity, { ext: uc.ext_id, gov: await loadGov(profile.org_id) });
  const kb = sopId ? await checkSopKbFor(profile.org_id, sopId, version ?? undefined) : null;
  const skill = new Map(rows.map((r) => [r.profile, r.skill_sha256]));
  const th = "px-3 py-2 text-start font-normal";

  return (
    <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="pf.eyebrow" en="SOP and job profiles" /></p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><TV k="pf.h1" en="What gets automated in {uc}?" v={{ uc: uc.ext_id }} /></h1>
        <p className="mt-3 max-w-[68ch] text-base text-ink-soft"><T k="pf.lede" en="The SOP is split into job profiles. Only the ticked profiles are assessed: risk flags are worked out from their tasks (a flag is on if any task has it), passed to the rules, and the use case takes the most restrictive verdict across the ticked profiles." /></p>
        <p className="mt-2 max-w-3xl rounded-lg border border-line px-3 py-2 text-sm font-medium"><T k="pf.sim" en="Synthetic data. The flags come from the reference analyzer's rules and are suggestions a person confirms. The four evidence cases below are simulated to show what each does to the verdict." /></p>

        <p className="mt-3"><Link className="text-sm underline" href={`/admin/federal/use-cases/${id}/tests`}><T k="pf.tests.link" en="Pilot tests and verdict parameters" /></Link></p>

        <section id="sop-setup" className={`${card} mt-6 scroll-mt-4`} aria-label="SOP">
          {sopId ? (
            <p className="text-sm"><TV k="pf.attached" en="Attached SOP: {sop}" v={{ sop: sopId }} /></p>
          ) : (
            <p className="text-sm font-medium"><T k="pf.noattach" en="No SOP is attached to this use case." /></p>
          )}
          {document ? (
            <details id="sop-text" open={view === "sop"} className="mt-3 scroll-mt-4 rounded-lg border border-line bg-paper px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium"><T k="sop.source" en="Source text" /></summary>
              <h2 className="mt-3 font-display text-xl font-medium" dir="auto">{document.title}</h2>
              <p className="mt-1 text-xs text-ink-soft">
                {sampleDoc ? <T k="pf.sop.sample_text" en="Shipped sample. It is not attached to this use case." />
                  : <TV k="pf.sop.attached_version" en="Attached version {v}" v={{ v: version ?? 1 }} />}
              </p>
              <div className="mt-3 max-w-[75ch] text-sm leading-relaxed whitespace-pre-wrap break-words" dir="auto">{document.text}</div>
            </details>
          ) : sopId && (
            <p id="sop-text" className="mt-3 scroll-mt-4 text-sm text-ink-soft"><T k="pf.sop.source.unavailable" en="The attached SOP text is unavailable." /></p>
          )}
          <p className="mt-3 flex flex-wrap gap-2">
            {SAMPLES.filter((s) => s.sop_id !== sopId).map((s) => <AttachButton key={s.sop_id} ucId={id} sopId={s.sop_id} canEdit={canEdit && !frozen} className={btnGhost} />)}
          </p>
          {!canEdit && <p className="mt-2 text-xs text-ink-soft"><T k="pf.attach.admin" en="Attaching a SOP needs an admin." /></p>}
          {(canEdit || sopId) && (
            <SopEditor
              ucId={id} attached={sopId} version={version} latest={latest?.version ?? null} frozen={frozen} changes={latest?.changes ?? null}
              openRequest={open ? { by: open.requested_email ?? open.requested_by, at: open.requested_at, reason: open.reason, plan: open.plan, from: open.from_version, to: open.to_version } : null}
              canEdit={canEdit} canRequest={perms.can("sop.change.request", id)} canApply={perms.can("sop.change.apply", id)}
              profiles={(profiles ?? []).map((p) => ({ name: p.name, tasks: p.tasks.map((t) => t.title) }))}
            />
          )}
        </section>

        {(canEdit || sopId) && <SopStructure ucId={id} canEdit={canEdit} frozen={frozen} attached={sopId} />}

        {sopId && (
          <section id="risk" className="mt-8 scroll-mt-4" aria-label="Job profiles">
            <nav aria-label="Rule set">
              <ul className="flex flex-wrap items-center gap-2 text-sm">
                <li className="font-mono text-xs text-ink-soft uppercase"><T k="pf.ruleset" en="Rule set" /></li>
                {RULESETS.map((r) => (
                  <li key={r.id}>
                    <Link href={`?j=${KEY[r.id]}#risk`} aria-current={r.id === rs.id ? "page" : undefined} className={`inline-block rounded-full border px-4 py-1.5 ${r.id === rs.id ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper-deep"}`}>{SHORT[r.id]}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div {...scrollRegion("pf-cap")} className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
              <table className="w-full min-w-[60rem] text-sm">
                <caption id="pf-cap" className="sr-only"><T k="pf.eyebrow" en="SOP and job profiles" /></caption>
                <thead className="font-mono text-[11px] tracking-wide text-ink-soft uppercase shadow-[0_1px_0_var(--color-line)]">
                  <tr>
                    <th scope="col" className={th}><T k="pf.automate" en="Automate" /></th>
                    <th scope="col" className={th}><T k="pf.profile" en="Job profile" /></th>
                    <th scope="col" className={th}><T k="pf.flags" en="Flags from its tasks" /></th>
                    <th scope="col" className={th}><T k="pf.gates" en="Gates that apply" /></th>
                    <th scope="col" className={th}><T k="pf.hitl" en="Human-in-the-loop rules" /></th>
                    {EVIDENCE_KEYS.map((k) => <th key={k} scope="col" className={th}><T k={`pf.ev.${k}`} en={EV_EN[k]} /></th>)}
                  </tr>
                </thead>
                <tbody>
                  {a.rows.map((r) => (
                    <tr key={r.name} className="border-t border-line align-top">
                      <td className="px-3 py-2.5">
                        <AutomateBox ucId={id} profile={r.name} checked={r.automate} canEdit={canEdit} />
                        {r.automate && (
                          <p className="mt-1 max-w-48 text-xs text-ink-soft">
                            {skill.get(r.name) ? <T k="pf.prep.ok" en="Vectors are current and the skill file was extracted." /> : <TV k="pf.prep.no" en="Not ready: {reason}" v={{ reason: kb?.ok ? "skill file" : kb?.reason ?? "" }} />}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><span className="font-medium">{r.name}</span><span className="block text-xs text-ink-soft"><TV k="pf.tasks" en="{n} tasks" one="1 task" v={{ n: r.tasks }} /></span></td>
                      <td className="px-3 py-2.5 text-xs">
                        {(Object.keys(FLAG_EN) as (keyof typeof FLAG_EN)[]).filter((f) => r.flags[f]).map((f) => <span key={f} className="me-1 mb-1 inline-block rounded-md bg-paper-deep px-1.5 py-0.5 font-mono"><T k={FLAG_KEY[f]} en={FLAG_EN[f]} /></span>)}
                        {!Object.values(r.flags).some(Boolean) && <span className="text-ink-soft"><T k="pf.noflags" en="none" /></span>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{r.gates}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.hitl}</td>
                      {EVIDENCE_KEYS.map((k) => <td key={k} className="px-3 py-2.5"><VerdictBadge verdict={r.verdicts[k]} /></td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-medium">
                    <th scope="row" colSpan={5} className="px-3 py-2.5 text-start font-medium"><T k="pf.rollup" en="Use case (most restrictive of the ticked profiles)" /></th>
                    {a.rollup ? EVIDENCE_KEYS.map((k) => <td key={k} className="px-3 py-2.5"><VerdictBadge verdict={a.rollup![k]} /></td>) : <td colSpan={4} className="px-3 py-2.5 text-ink-soft"><T k="pf.rollup.none" en="Tick at least one job profile to assess it." /></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 max-w-3xl text-xs text-ink-soft"><T k="pf.heur" en="The flags are rough rules: they sometimes over-flag (the safe direction) and can miss one. A person confirms them." /></p>
          </section>
        )}
      </main>
    </LangShell>
  );
}
