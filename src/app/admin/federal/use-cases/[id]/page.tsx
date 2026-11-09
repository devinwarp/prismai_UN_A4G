import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEntityGoals } from "@/lib/un/store";
import { attest, TARGET_RUNS, DEFAULT_THRESHOLDS } from "@/lib/un/sijil";
import { loadReports, loadRuns, loadUseCase } from "@/lib/un/sijil-store";
import AdminHeader from "../../../AdminHeader";
import { liveConfigFromEnv, liveNode } from "@/lib/un/sijil-live";
import SijilPanel from "./SijilPanel";

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
    <section className="mx-auto mt-10 max-w-6xl px-4 sm:px-6" aria-label="Change history">
      <h2 className="text-lg font-semibold">Change history</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Every change to this use case's stage, verdict or compliant flag is stored with its old and new value in an append-only,
        hash-chained log. History starts when the log was installed.{" "}
        {v ? (v.ok ? `✓ Chain verified: ${v.length} records, intact.` : `✕ Chain broken at record ${v.broken_seq}: ${v.reason}`) : ""}
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No changes recorded for this use case yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.seq} className="py-2">
              <span className="tabular-nums text-ink-soft">#{r.seq} · {new Date(r.at).toLocaleString("en-GB", DUBAI)} · {r.actor}</span>
              <div>
                {Object.entries(r.changes).filter(([k]) => !k.startsWith("verdict_") || k === "verdict").map(([k, c]) => (
                  <span key={k} className="mr-4">{k}: {show(c.from)} → <strong>{show(c.to)}</strong></span>
                ))}
              </div>
              <code className="text-xs text-ink-soft">{r.hash.slice(0, 16)}…</code>
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
  const [goals, runs, reports, { data: org }] = await Promise.all([
    loadEntityGoals(profile.org_id, uc.entity),
    loadRuns(profile.org_id, id),
    loadReports(profile.org_id, id),
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
  ]);
  let liveMode = false;
  try { liveMode = liveConfigFromEnv() !== null; } catch { liveMode = true; /* misconfigured: the pull reports the error */ }
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
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
      <ChangeHistory ext_id={uc.ext_id} />
      <div className="h-12" />
    </div>
  );
}
