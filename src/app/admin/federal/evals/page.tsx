import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { evalSetFor } from "@/lib/un/evalset";
import { alignment } from "@/lib/un/eval-run";
import { loadEvalRuns } from "@/lib/un/eval-store";
import { loadUnUseCases } from "@/lib/un/store";
import AdminHeader from "../../AdminHeader";
import { card } from "../_components/ui";

export const metadata: Metadata = { title: "Agent evaluations side by side", robots: { index: false, follow: false } };

export default async function EvalsOverview() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/evals");
  if (!profile?.org_id) redirect("/login");
  const [{ data: org }, ucs] = await Promise.all([
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    loadUnUseCases(profile.org_id),
  ]);
  const withSets = ucs.filter((u) => evalSetFor(u.ext_id).length > 0);
  const rows = await Promise.all(withSets.map(async (u) => ({ u, latest: (await loadEvalRuns(profile.org_id!, u.id, 1))[0] })));

  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">Agent evaluations</p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Is each agent ready for its process?</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-soft">
          The same eval and the same approval bar for every use case: Sijil rejected no call, and every held-out case was correct.
          Simulated demo data. Open a use case to see each output against the expected output.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {rows.map(({ u, latest }) => {
            const al = latest ? alignment(latest.summary) : null;
            return (
              <article key={u.id} className={card} aria-label={u.title}>
                <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">{u.ext_id} · {u.entity}</p>
                <h2 className="mt-1 text-lg font-semibold">{u.title}</h2>
                {!latest || !al ? (
                  <p className="mt-3 text-sm text-ink-soft">No run yet.</p>
                ) : (
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-ink-soft">Correct</dt><dd>{latest.summary.all.correct}/{latest.summary.all.n}</dd>
                    <dt className="text-ink-soft">Hallucinated</dt><dd>{latest.summary.all.hallucinated}</dd>
                    <dt className="text-ink-soft">Misaligned</dt><dd>{latest.summary.all.misaligned}</dd>
                    <dt className="text-ink-soft">Sijil rejected</dt><dd>{latest.summary.sijil.rejected} of {latest.summary.sijil.calls} calls</dd>
                    <dt className="text-ink-soft">Approval bar</dt><dd className="font-medium">{al.met ? "✓ met" : "✕ not met"}</dd>
                  </dl>
                )}
                <Link href={`/admin/federal/use-cases/${u.id}/evals`} className="mt-4 inline-block text-sm underline underline-offset-4">Open the evals</Link>
              </article>
            );
          })}
        </div>
        {rows.length === 0 && <p className="mt-8 text-sm text-ink-soft">No use case has an eval set yet.</p>}
      </main>
      <div className="h-12" />
    </div>
  );
}
