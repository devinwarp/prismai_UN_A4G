import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadChunks } from "@/lib/un/kb";
import { loadRun, verifyRun } from "@/lib/un/runs";
import { SCENARIOS } from "@/lib/un/scenarios";
import AdminHeader from "../../../AdminHeader";
import RunView from "./RunView";

export const metadata: Metadata = { title: "Scenario run", robots: { index: false, follow: false } };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/runs/${id}`);
  if (!profile?.org_id) redirect("/login");
  const row = await loadRun(profile.org_id, id);
  const sc = row && SCENARIOS[row.scenario_id];
  if (!row || !sc) notFound();
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  // Only the chunks this run cites: source, link and the hash of the source file.
  const cited = new Set(row.state.log.flatMap((r) => r.kb_citations.map((c) => c.chunk_id)));
  const sources = Object.fromEntries(
    loadChunks().filter((c) => cited.has(c.chunk_id)).map((c) => [c.chunk_id, { title: c.title, url: c.url, sha256: c.sha256 }]),
  );
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <RunView
          runId={id}
          title={sc.title}
          totalSteps={sc.steps.length}
          state={row.state}
          verification={verifyRun(row)}
          sources={sources}
          canEdit={profile.role === "admin"}
          isGate={sc.kind === "gate"}
          llmAvailable={Boolean(process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY)}
        />
      </main>
    </div>
  );
}
