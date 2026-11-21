import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEntityGoals } from "@/lib/un/store";
import { attest, TARGET_RUNS, DEFAULT_THRESHOLDS } from "@/lib/un/sijil";
import { loadReports, loadRuns, loadUseCase } from "@/lib/un/sijil-store";
import { liveConfigFromEnv, liveNode } from "@/lib/un/sijil-live";
import SijilPanel from "./SijilPanel";
import UseCaseGates from "./UseCaseGates";
import LangShell, { T, TV } from "../../_components/Lang";
import { effectiveGates } from "@/lib/un/gates";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { loadRun } from "@/lib/un/runs";

const DUBAI = { timeZone: "Asia/Dubai" } as const;
interface ChangeRow { seq: number; at: string; op: string; changes: Record<string, { from: unknown; to: unknown }>; actor: string; hash: string }
const show = (v: unknown) => (v === null || v === undefined ? "none" : typeof v === "string" ? v : JSON.stringify(v));

/** Tamper-evident history of this use case (un_change_log, supabase/un-federal-t2.sql). Renders nothing if the table is absent. */
async function ChangeHistory({ ext_id }: { ext_id: string }) {
  const admin = createAdminClient();
  const [{ data, error }, ver] = await Promise.all([
    admin.from("un_change_log").select("seq, at, op, changes, actor, hash").eq("table_name", "un_use_cases").like("row_id", `${ext_id} (%`).order("seq", { ascending: false }).limit(20),
    admin.rpc("un_verify_change_log"),
  ]);
  if (error) return null;
  const v = (ver.data as { ok: boolean; length: number; broken_seq: number | null; reason: string | null }[] | null)?.[0];
  const rows = (data ?? []) as ChangeRow[];
  return (
    <section className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
      <h2 className="text-lg font-semibold"><T k="uc.ch.title" en="Change history" /></h2>
      <p className="mt-1 text-sm text-ink-soft">
        <T k="uc.ch.lede" en="Every change to this use case's stage, verdict or compliant flag is stored with its old and new value in an append-only, hash-chained log. History starts when the log was installed." />{" "}
        {v ? (v.ok ? <TV k="uc.ch.ok" en="✓ Chain verified: {n} records, intact." v={{ n: v.length }} /> : <><TV k="uc.ch.bad" en="✕ Chain broken at record {n}:" v={{ n: v.broken_seq ?? "" }} /> {v.reason}</>) : ""}
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft"><T k="uc.ch.none" en="No changes recorded for this use case yet." /></p>
      ) : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.seq} className="py-2">
              <bdi dir="ltr" className="tabular-nums text-ink-soft">#{r.seq} · {new Date(r.at).toLocaleString("en-GB", DUBAI)} · {r.actor}</bdi>
              <div>
                {Object.entries(r.changes).filter(([k]) => !k.startsWith("verdict_") || k === "verdict").map(([k, c]) => (
                  <span key={k} className="me-4"><bdi dir="ltr">{k}: {show(c.from)} → <strong>{show(c.to)}</strong></bdi></span>
                ))}
              </div>
              <code dir="ltr" className="block text-start text-xs break-all text-ink-soft">{r.hash.slice(0, 16)}…</code>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export const metadata: Metadata = { title: "Pilot and Sijil", robots: { index: false, follow: false } };

export default async function UseCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}`);
  if (!profile?.org_id) redirect("/login");
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const [goals, runs, reports] = await Promise.all([
    loadEntityGoals(profile.org_id, uc.entity),
    loadRuns(profile.org_id, id),
    loadReports(profile.org_id, id),
  ]);
  const eff = effectiveGates({ ext: uc.ext_id, facts: factsOf(uc), gov: await loadGov(profile.org_id) });
  const verdictRun = uc.verdict_run_id ? await loadRun(profile.org_id, uc.verdict_run_id) : null;
  let liveMode = false;
  try { liveMode = liveConfigFromEnv() !== null; } catch { liveMode = true; /* misconfigured: the pull reports the error */ }
  return (
    <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="mb-4 text-sm">
          <Link href="/admin/federal/evals" className="underline underline-offset-4"><T k="uc.pg.all" en="All use cases side by side" /></Link>
        </p>
        <SijilPanel
          uc={uc}
          runs={runs}
          goals={goals}
          attestation={attest(runs)}
          thresholds={DEFAULT_THRESHOLDS}
          target={TARGET_RUNS}
          liveMode={liveMode}
          liveNode={liveNode(runs)}
          reports={reports}
          canEdit={profile.role === "admin"}
        />
      </main>
      <div>
        <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
          <UseCaseGates useCaseId={id} ext={uc.ext_id} eff={eff} runGates={verdictRun?.state.state?.gates ?? {}} canEdit={profile.role === "admin"} approvers={await approversForUseCase(profile.org_id, id)} />
        </div>
      </div>
      <ChangeHistory ext_id={uc.ext_id} />
      <div className="h-12" />
    </LangShell>
  );
}
