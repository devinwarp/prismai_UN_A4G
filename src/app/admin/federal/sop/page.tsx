import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadUnUseCases } from "@/lib/un/store";
import { loadSamples } from "@/lib/un/sop/data";
import AdminHeader from "../../AdminHeader";
import LangShell, { T } from "../_components/Lang";
import SopWorkbench from "./SopWorkbench";

export const metadata: Metadata = { title: "From a procedure to a use case", robots: { index: false, follow: false } };

export default async function SopPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/sop");
  if (!profile?.org_id) redirect("/login");
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  // The samples are a pure function of the fixtures, so the judge/viewer role sees them with no upload path.
  const samples = loadSamples().map(({ input, analysis }) => ({ id: input.sop_id, title: input.title, text: input.text, analysis }));
  const canEdit = profile.role === "admin";
  const uc02Id = (await loadUnUseCases(profile.org_id)).find((u) => u.ext_id === "UC02")?.id ?? null;
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <LangShell>
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">{canEdit ? "Procedure intake" : "Read-only"}</p>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="sop.title" en="From a procedure to a governed use case" /></h1>
          <p className="mt-3 max-w-[68ch] text-base text-ink-soft">
            <T k="sop.lede" en="Pick a sample procedure or add your own. Prism reads the steps, estimates what could be automated against a made-up baseline, flags the risks, and sends the result to the compare page for a decision." />{" "}
            <Link href="/admin/federal" className="underline"><T k="sop.back" en="Back to the dashboard" /></Link>
          </p>
          <SopWorkbench samples={samples} canEdit={canEdit} uc02Id={uc02Id} />
        </main>
      </LangShell>
    </div>
  );
}
