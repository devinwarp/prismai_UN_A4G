import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listOutside } from "@/lib/un/outside-queue";
import AdminHeader from "../../AdminHeader";
import LangShell, { T, TV } from "../_components/Lang";
import { card } from "../_components/ui";
import { AnswerForm, AskForm } from "./OutsideControls";

export const metadata: Metadata = { title: "Outside-information requests", robots: { index: false, follow: false } };

const DUBAI = { timeZone: "Asia/Dubai" } as const;

export default async function OutsidePage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/outside");
  if (!profile?.org_id) redirect("/login");
  const db = createAdminClient();
  const [{ data: org }, rows] = await Promise.all([db.from("organizations").select("name").eq("id", profile.org_id).maybeSingle(), listOutside(db, profile.org_id)]);
  const canEdit = profile.role === "admin";
  const open = rows.filter((r) => r.status === "open");
  const done = rows.filter((r) => r.status === "answered");
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <LangShell>
        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">{canEdit ? <T k="oq.eyebrow" en="Agent runtime" /> : <T k="oq.eyebrow.ro" en="Agent runtime · read-only" />}</p>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="oq.title" en="Outside-information requests" /></h1>
          <p className="mt-3 max-w-[68ch] text-base text-ink-soft">
            <T k="oq.lede" en="When the SOP cannot answer a question, the agent must not answer from memory. It makes a required outside-information call, and the request waits here for a person. The answer is added to the case's hash-chained memory with your role, and the agent picks it up from memory the next time it is asked." />{" "}
            <Link href="/admin/federal" className="underline"><T k="oq.back" en="Back to the dashboard" /></Link>
          </p>
          <p className="mt-3 rounded-lg border border-line px-3 py-2 text-sm font-medium"><T k="oq.demo" en="Demo data: the case, the licence and the SOP are fictitious. Retrieval here is keyword search, and the agent's reasoning is rule-based unless a model is configured on the server." /></p>

          {canEdit && <section className={`${card} mt-6`} aria-label="Ask"><AskForm /></section>}

          <section className="mt-8" aria-label="Open requests">
            <h2 className="text-lg font-semibold"><TV k="oq.open" en="Waiting for a person ({n})" v={{ n: open.length }} /></h2>
            {open.length === 0 ? <p className="mt-2 text-sm text-ink-soft"><T k="oq.none" en="Nothing is waiting." /></p> : (
              <ul className="mt-3 space-y-3">
                {open.map((r) => (
                  <li key={r.id} className={card}>
                    <p className="font-medium">“{r.question}”</p>
                    <p className="mt-1 text-xs text-ink-soft"><TV k="oq.meta" en="Case {c} · {p} · {t}" v={{ c: r.case_id, p: r.profile, t: new Date(r.created_at).toLocaleString("en-GB", DUBAI) }} /></p>
                    <p className="mt-2 text-sm text-ink-soft"><T k="oq.why" en="Why it came here:" /> {r.reason}</p>
                    {r.tried.length > 0 && <p className="mt-1 text-xs text-ink-soft"><T k="oq.tried" en="Searches tried:" /> <span dir="ltr">{r.tried.join(" | ")}</span></p>}
                    {canEdit ? <AnswerForm id={r.id} /> : <p className="mt-3 text-sm text-ink-soft"><T k="oq.viewer" en="Only an admin can answer. You have read-only access." /></p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8" aria-label="Answered requests">
            <h2 className="text-lg font-semibold"><TV k="oq.done" en="Answered ({n})" v={{ n: done.length }} /></h2>
            {done.length === 0 ? <p className="mt-2 text-sm text-ink-soft"><T k="oq.none2" en="No answers yet." /></p> : (
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
                {done.map((r) => (
                  <li key={r.id} className="p-4">
                    <p className="font-medium">“{r.question}”</p>
                    <p className="mt-1">{r.answer}</p>
                    <p className="mt-1 text-xs text-ink-soft"><TV k="oq.by" en="Answered by role {role} · {t} · memory entry" v={{ role: r.answered_role ?? "", t: r.answered_at ? new Date(r.answered_at).toLocaleString("en-GB", DUBAI) : "" }} /> <code dir="ltr">{r.memory_hash?.slice(0, 12)}…</code></p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </LangShell>
    </div>
  );
}
