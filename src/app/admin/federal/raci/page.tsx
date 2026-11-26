import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFederalReadAccess } from "@/lib/un/federal-read-access";
import { loadUseCaseChoices } from "@/lib/un/roles-store";
import ToolWorkspace from "../_components/ToolWorkspace";
import { T } from "../_components/Lang";
import RaciMatrix from "./RaciMatrix";

export const metadata: Metadata = { title: "RACI by use case", robots: { index: false, follow: false } };

// who holds which position changes: never prerender it
export const dynamic = "force-dynamic";

export default async function RaciPage({ searchParams }: { searchParams: Promise<{ use_case?: string }> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/raci");
  if (!profile?.org_id) redirect("/login");
  const orgId = profile.org_id;
  const access = await loadFederalReadAccess(orgId, user.id, profile.role);
  const [{ data: org }, all] = await Promise.all([createAdminClient().from("organizations").select("name").eq("id", orgId).maybeSingle(), loadUseCaseChoices(orgId)]);
  // only the use cases this person may read
  const choices = all.filter((u) => access.allCases || access.caseIds.has(u.id));
  const sp = await searchParams;
  const chosen = choices.find((u) => u.id === sp.use_case) ?? choices[0];
  return (
    <ToolWorkspace orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="rc.title" en="RACI by use case" />}
      description={<T k="rc.desc" en="Who does the work, who answers for it, who is asked and who is told, for each step of a use case. The defaults come from people's roles; an administrator or the entity admin can change a letter for one person." />}>
      {chosen ? (
        <div className="space-y-4">
          <nav aria-label="Use cases" className="flex flex-wrap gap-2 text-sm">
            {choices.map((u) => (
              <Link key={u.id} href={`/admin/federal/raci?use_case=${u.id}`} aria-current={u.id === chosen.id ? "page" : undefined} title={`${u.title} (${u.entity})`}
                className={`rounded-full border px-3 py-1 font-mono text-xs ${u.id === chosen.id ? "border-ink bg-ink text-paper" : "border-line hover:border-ink-soft"}`}>{u.ext_id}</Link>
            ))}
          </nav>
          <h2 className="font-display text-xl font-medium">{chosen.ext_id} · {chosen.title} <span className="text-sm text-ink-soft">({chosen.entity})</span></h2>
          <RaciMatrix key={chosen.id} useCaseId={chosen.id} />
        </div>
      ) : <p className="text-sm text-ink-soft"><T k="rc.none" en="There are no use cases you can read." /></p>}
    </ToolWorkspace>
  );
}
