import type { Metadata } from "next";
import type { CountryQuery } from "@/lib/un/country-context";
import { loadCountrySop } from "@/lib/un/federal-country";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { requireFederalToolAccess } from "@/lib/un/federal-read-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { listOutside } from "@/lib/un/outside-queue";
import ToolWorkspace, { WorkspacePane } from "../_components/ToolWorkspace";
import { T, TV } from "../_components/Lang";
import { En, Ltr, Role, TX } from "../_components/b-bits";
import { AnswerForm, AskForm } from "./OutsideControls";

export const metadata: Metadata = { title: "Outside-information requests", robots: { index: false, follow: false } };

const DUBAI = { timeZone: "Asia/Dubai" } as const;

export default async function OutsidePage({ searchParams }: { searchParams: Promise<CountryQuery> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/outside");
  if (!profile?.org_id) redirect("/login");
  const { browseCountries } = await requireFederalToolAccess(profile.org_id, user.id, profile.role);
  const { country, uc02 } = await loadCountrySop(profile.org_id, (await searchParams).country, browseCountries);
  const db = createAdminClient();
  const [{ data: org }, rows] = await Promise.all([db.from("organizations").select("name").eq("id", profile.org_id).maybeSingle(), uc02 ? listOutside(db, profile.org_id) : Promise.resolve([])]);
  const canEdit = profile.role === "admin";
  const requests = rows.filter((r) => r.sop_id === "SOP-LIC-014");
  const open = requests.filter((r) => r.status === "open");
  const done = requests.filter((r) => r.status === "answered");
  return (
    <ToolWorkspace country={country} orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="oq.title" en="Outside-information requests" />}
      description={<T k="workspace.outside.description" en="Review questions the SOP could not answer. Recorded replies become part of the case history." />}>
      <div className={`grid min-w-0 gap-4 lg:grid-cols-2 desk:min-h-0 desk:flex-1 short:gap-3 ${canEdit && uc02 ? "desk:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(16rem,0.72fr)]" : ""}`}>
        <WorkspacePane id="outside-open" title={<TV k="oq.open" en="Waiting for a person ({n})" v={{ n: open.length }} />}>
            {open.length === 0 ? <p className="mt-2 text-sm text-ink-soft"><T k="oq.none" en="Nothing is waiting." /></p> : (
              <ul className="divide-y divide-line">
                {open.map((r) => (
                  <li key={r.id} className="py-4 first:pt-0">
                    <p className="font-medium">“{r.question}”</p>
                    <p className="mt-1 text-xs text-ink-soft"><TX k="oq.meta" en="Case {c} · {p} · {t}" v={{ c: <Ltr>{r.case_id}</Ltr>, p: <En>{r.profile}</En>, t: <Ltr>{new Date(r.created_at).toLocaleString("en-GB", DUBAI)}</Ltr> }} /></p>
                    <p className="mt-2 text-sm text-ink-soft"><T k="oq.why" en="Why it came here:" /> <En>{r.reason}</En></p>
                    {r.tried.length > 0 && <p className="mt-1 text-xs text-ink-soft"><T k="oq.tried" en="Searches tried:" /> <bdi dir="ltr" lang="en">{r.tried.join(" | ")}</bdi></p>}
                    {canEdit ? <AnswerForm id={r.id} /> : <p className="mt-3 text-sm text-ink-soft"><T k="oq.viewer" en="Only an admin can answer. You have read-only access." /></p>}
                  </li>
                ))}
              </ul>
            )}
        </WorkspacePane>
        <WorkspacePane id="outside-answered" title={<TV k="oq.done" en="Answered ({n})" v={{ n: done.length }} />}>
            {done.length === 0 ? <p className="mt-2 text-sm text-ink-soft"><T k="oq.none2" en="No answers yet." /></p> : (
              <ul className="divide-y divide-line text-sm">
                {done.map((r) => (
                  <li key={r.id} className="py-4 first:pt-0">
                    <p className="font-medium">“{r.question}”</p>
                    <p className="mt-1">{r.answer}</p>
                    <p className="mt-1 text-xs text-ink-soft"><TX k="oq.by" en="Answered by role {role} · {t} · memory entry" v={{ role: <Role id={r.answered_role ?? ""} />, t: <Ltr>{r.answered_at ? new Date(r.answered_at).toLocaleString("en-GB", DUBAI) : ""}</Ltr> }} /> <bdi dir="ltr"><code>{r.memory_hash?.slice(0, 12)}…</code></bdi></p>
                  </li>
                ))}
              </ul>
            )}
        </WorkspacePane>
        {canEdit && uc02 && (
          <WorkspacePane id="outside-demo" title={<T k="workspace.outside.demo" en="Demo question" />}>
            <AskForm country={country.id} />
            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft"><T k="oq.demo" en="Demo data: the case, the licence and the SOP are fictitious. Retrieval here is keyword search, and the agent's reasoning is rule-based unless a model is configured on the server." /></p>
          </WorkspacePane>
        )}
      </div>
    </ToolWorkspace>
  );
}
