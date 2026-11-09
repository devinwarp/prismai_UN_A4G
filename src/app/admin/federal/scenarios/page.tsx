import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listRuns } from "@/lib/un/runs";
import { SCENARIOS } from "@/lib/un/scenarios";
import AdminHeader from "../../AdminHeader";
import StartRun from "./StartRun";

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
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">Staged scenarios</p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Run a scenario</h1>
        <p className="mt-3 max-w-[68ch] text-sm text-ink-soft">
          Events are released one step at a time, each to only some of the agents. Every step is
          traced and hash-chained. <Link href="/admin/federal" className="underline">Back to the dashboard</Link>
        </p>
        <h2 className="font-display mt-8 text-2xl font-medium tracking-tight">Choose a scenario</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-1">
          {Object.values(SCENARIOS).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-line bg-card p-5 sm:p-6">
              <div className="min-w-0 flex-1 basis-72">
                <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-soft">
                  <span className="rounded-md bg-paper-deep px-2 py-0.5 font-medium text-ink">{s.id}</span>
                  <span>{s.kind === "gate" ? "gate engine: one use case, verdict per step" : "federal portfolio: dashboard per step"}</span>
                </p>
                <p className="font-display mt-2 text-xl">{s.title}</p>
                <ol className="mt-3 flex items-center gap-1.5" aria-label={`${s.steps.length} steps`}>
                  {s.steps.map((st) => (
                    <li key={st.step} className="flex h-6 min-w-8 items-center justify-center rounded-md border border-line px-1.5 font-mono text-[10px] text-ink-soft">{st.step}</li>
                  ))}
                </ol>
              </div>
              {profile.role === "admin" && <StartRun scenarioId={s.id} />}
            </li>
          ))}
        </ul>
        <h2 className="font-display mt-12 text-2xl font-medium tracking-tight">Past runs</h2>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/federal/runs/${r.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5 text-sm hover:bg-paper-deep/60">
                <span className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md bg-paper-deep px-2 py-0.5 font-mono text-xs font-medium">{r.scenario_id}</span>
                  <span>{r.steps} step{r.steps === 1 ? "" : "s"} released</span>
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${r.done ? "border-lit/50 text-lit-deep" : "border-line text-ink-soft"}`}>{r.done ? "✓ complete" : "in progress"}</span>
                </span>
                <span className="text-ink-soft tabular-nums">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}</span>
              </Link>
            </li>
          ))}
          {!runs.length && <li className="px-5 py-8 text-center text-sm text-ink-soft">No runs yet. Start one above; each step you release is traced and hash-chained.</li>}
        </ul>
      </main>
    </div>
  );
}
