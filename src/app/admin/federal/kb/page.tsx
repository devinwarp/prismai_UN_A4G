import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadChunks } from "@/lib/un/kb";
import AdminHeader from "../../AdminHeader";
import LangShell, { T } from "../_components/Lang";
import { ArOnly } from "../_components/b-bits";
import KbSearch, { type SourceMeta } from "./KbSearch";

export const metadata: Metadata = { title: "Knowledge base", robots: { index: false, follow: false } };

export default async function KbPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/kb");
  if (!profile?.org_id) redirect("/login");
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), "kb", "sources.json"), "utf8")) as Record<string, unknown>[];
  const chunks = loadChunks();
  const count = new Map<string, number>();
  const section: Record<string, string> = {};
  for (const c of chunks) {
    count.set(c.source_id, (count.get(c.source_id) ?? 0) + 1);
    section[c.chunk_id] = c.text.match(/\(([^()]*)\)\s*$/)?.[1] ?? "";
  }
  const sources: SourceMeta[] = raw.map((s) => ({
    id: String(s.id), title: String(s.title), url: String(s.url), issuer: String(s.issuer),
    jurisdiction: String(s.jurisdiction), instrument_type: String(s.instrument_type), binding: !!s.binding,
    date: s.date ? String(s.date) : null, sha256: String(s.source_sha256), chunks: count.get(String(s.id)) ?? 0,
  }));
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <LangShell>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="gt.readonly" en="Read-only" /></p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="ub.kb.title" en="Knowledge base explorer" /></h1>
        <p className="mt-3 max-w-[68ch] text-sm text-ink-soft">
          <T k="ub.kb.lede" en="Every answer in Prism cites a chunk from this knowledge base. Search it directly." />{" "}
          <Link href="/admin/federal" className="underline"><T k="sop.back" en="Back to the dashboard" /></Link>
        </p>
        <ArOnly><p role="note" className="mt-2 max-w-[68ch] text-xs text-ink-soft"><T k="ub.kb.ennote" en="" /></p></ArOnly>
        <KbSearch sources={sources} sections={section} />
      </main>
      </LangShell>
    </div>
  );
}
