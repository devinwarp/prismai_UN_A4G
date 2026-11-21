import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { appKbStore } from "@/lib/un/kb-store-app";
import { extractSkill } from "@/lib/un/sop-kb";
import { loadState, PROFILES } from "@/lib/un/tuning-service";
import AdminHeader from "../../AdminHeader";
import LangShell, { T } from "../_components/Lang";
import TuningBoard from "./TuningBoard";

export const metadata: Metadata = { title: "Tune the agent", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TuningPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/tuning");
  if (!profile?.org_id) redirect("/login");
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  const state = await loadState({ store: appKbStore(profile.org_id) });
  const profiles = PROFILES.map((name) => ({ name, base: extractSkill("SOP-LIC-014", name).markdown, active: state.skills[name] }));
  const canEdit = profile.role === "admin";
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <LangShell>
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="tn.eyebrow" en="SOP-LIC-014 · synthetic" /></p>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="tn.title" en="Tune the agent from the front end" /></h1>
          <p className="mt-3 max-w-[68ch] text-base text-ink-soft">
            <T k="tn.lede" en="Run the question bank, open any answer to see how the agent reached it, fix a miss with one click, and edit the agent's rules. A person approves every change before the agent uses it." />{" "}
            <Link href="/admin/federal" className="underline"><T k="sop.back" en="Back to the dashboard" /></Link>
          </p>
          <TuningBoard state={state} profiles={profiles} canEdit={canEdit} />
        </main>
      </LangShell>
    </div>
  );
}
