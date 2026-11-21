import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listRuns } from "@/lib/un/runs";
import { SCENARIOS } from "@/lib/un/scenarios";
import AdminHeader from "../../AdminHeader";
import LangShell, { T, TV } from "../_components/Lang";
import StartRun from "./StartRun";

const WHAT: Record<string, string> = {
  S1: "A trade-licence assistant is cleared step by step. Watch the decision go from blocked to cleared as evidence arrives. About 2 minutes.",
  S2: "A voice assistant on a live pilot starts making things up. See how a rising error rate changes the decision.",
  S3: "The federal view: 20 use cases in 5 entities, and how the 50% target moves at each step.",
  S4: "A citizen assistant starts promoting paid products, then leaks personal data. The decision escalates.",
};

export const metadata: Metadata = { title: "Scenarios", robots: { index: false, follow: false } };

export default async function ScenariosPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/scenarios");
  if (!profile?.org_id) redirect("/login");
  const [{ data: org }, runs] = await Promise.all([
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    listRuns(profile.org_id),
  ]);
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <LangShell>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="sc.eyebrow" en="Staged scenarios" /></p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="sc.title" en="Run a scenario" /></h1>
        <p className="mt-3 max-w-[68ch] text-sm text-ink-soft">
          <T k="sc.lede" en="You release evidence one step at a time, each step to only some of the agents. The policy engine decides, a person signs, and every step is written to a tamper-proof logbook." />{" "}
          <Link href="/admin/federal" className="underline"><T k="sc.back" en="Back to the dashboard" /></Link>
        </p>
        <h2 className="font-display mt-8 text-2xl font-medium tracking-tight"><T k="sc.choose" en="Choose a scenario" /></h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-1">
          {Object.values(SCENARIOS).map((s, idx) => (
            <li key={s.id} style={{ ["--i" as string]: idx }} className="fx-rise flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-line bg-card p-5 sm:p-6">
              <div className="min-w-0 flex-1 basis-72">
                <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-soft">
                  <span className="rounded-md bg-paper-deep px-2 py-0.5 font-medium text-ink">{s.id}</span>
                  <span>{s.kind === "gate" ? <T k="sc.kind.gate" en="One use case: a decision at each step" /> : <T k="sc.kind.fed" en="Whole portfolio: a sandbox copy of the dashboard at each step (not the live register)" />}</span>
                  {idx === 0 && <span className="rounded-full border border-lit/50 px-2 py-0.5 text-lit-deep"><T k="sc.first" en="Start with this one" /></span>}
                </p>
                <p className="font-display mt-2 text-xl"><T k={`ua.sc.${s.id}.title`} en={s.title} /></p>
                {WHAT[s.id] && <p className="mt-1 max-w-[56ch] text-sm text-ink-soft"><T k={`ua.sc.${s.id}.what`} en={WHAT[s.id]} /></p>}
                <ol className="mt-3 flex items-center gap-1.5" aria-label={`${s.steps.length} steps`} dir="ltr">
                  {s.steps.map((st) => (
                    <li key={st.step} className="flex h-6 min-w-8 items-center justify-center rounded-md border border-line px-1.5 font-mono text-[10px] text-ink-soft">{st.step}</li>
                  ))}
                </ol>
              </div>
              {profile.role === "admin" && <StartRun scenarioId={s.id} primary={idx === 0} />}
            </li>
          ))}
        </ul>
        <h2 className="font-display mt-12 text-2xl font-medium tracking-tight"><T k="sc.past" en="Past runs" /></h2>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/federal/runs/${r.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5 text-sm hover:bg-paper-deep/60">
                <span className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md bg-paper-deep px-2 py-0.5 font-mono text-xs font-medium">{r.scenario_id}</span>
                  <span>{r.steps === 1 ? <T k="ua.sc.step1" en="1 step released" /> : <TV k="ua.sc.steps" en="{n} steps released" v={{ n: r.steps }} />}</span>
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${r.done ? "border-lit/50 text-lit-deep" : "border-line text-ink-soft"}`}>{r.done ? <>✓ <T k="ua.sc.complete" en="complete" /></> : <T k="ua.sc.progress" en="in progress" />}</span>
                </span>
                <bdi dir="ltr" className="text-ink-soft tabular-nums">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}</bdi>
              </Link>
            </li>
          ))}
          {!runs.length && <li className="px-5 py-8 text-center text-sm text-ink-soft"><T k="sc.nopast" en="No runs yet. Start with the first scenario above: about two minutes, and you will see a decision made, signed, and locked into the logbook." /></li>}
        </ul>
      </main>
      </LangShell>
    </div>
  );
}
