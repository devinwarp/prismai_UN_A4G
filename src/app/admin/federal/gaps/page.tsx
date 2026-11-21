import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadChunks } from "@/lib/un/kb";
import { GAP_CATEGORIES, loadGaps } from "@/lib/un/gaps";
import AdminHeader from "../../AdminHeader";
import LangShell, { T } from "../_components/Lang";
import { ArOnly } from "../_components/b-bits";

export const metadata: Metadata = { title: "Policy and standards gaps", robots: { index: false, follow: false } };

export default async function GapsPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/gaps");
  if (!profile?.org_id) redirect("/login");
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  const f = loadGaps();
  const chunk = new Map(loadChunks().map((c) => [c.chunk_id, c]));
  const quote = (id: string) => {
    const c = chunk.get(id);
    return c ? (
      <blockquote dir="ltr" lang="en" className="mt-1 border-s-2 border-line ps-3 text-xs text-ink-soft">
        {c.text.length > 320 ? `${c.text.slice(0, 320)}…` : c.text}
        <span className="mt-1 block font-mono">{id} · <a href={c.url} className="underline">{c.title}</a></span>
      </blockquote>
    ) : null;
  };
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <LangShell>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="gt.readonly" en="Read-only" /></p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="ub.gap.title" en={f.title} /></h1>
        <p className="mt-3 max-w-[68ch] text-sm text-ink-soft">
          <span dir="ltr" lang="en" className="block text-start">{f.scope}</span> <Link href="/admin/federal" className="underline"><T k="sop.back" en="Back to the dashboard" /></Link>
        </p>
        <ArOnly><p role="note" className="mt-3 max-w-[68ch] rounded-lg border border-dashed border-line px-3 py-2 text-sm"><T k="ub.en.note" en="" /></p></ArOnly>
        <nav aria-label="Gap categories" className="mt-5 flex flex-wrap gap-2 text-xs">
          {GAP_CATEGORIES.map((c) => (
            <a key={c} href={`#${c}`} className="rounded-full border border-line px-3 py-1 hover:border-ink-soft hover:bg-paper-deep"><T k={`ub.gap.cat.${c}`} en={f.categories[c]} /></a>
          ))}
        </nav>
        {GAP_CATEGORIES.map((cat) => (
          <section key={cat} id={cat} aria-labelledby={`h-${cat}`}>
            <h2 id={`h-${cat}`} className="font-display mt-10 text-2xl font-medium tracking-tight"><T k={`ub.gap.cat.${cat}`} en={f.categories[cat]} /></h2>
            <ul className="mt-4 grid gap-4">
              {f.gaps.filter((g) => g.category === cat).map((g) => (
                <li key={g.id} className="rounded-2xl border border-line bg-card p-5 sm:p-6">
                  <p className="font-mono text-xs"><span dir="ltr" className="rounded-md bg-paper-deep px-2 py-0.5 font-medium text-ink">{g.id}</span></p>
                  <p dir="ltr" lang="en" className="font-display mt-2 text-start text-xl">{g.statement}</p>
                  <h3 className="mt-4 font-mono text-xs tracking-[0.15em] text-ink-soft uppercase"><T k="ub.gap.nat" en="What the national sources say" /></h3>
                  <ul className="mt-2 space-y-3 text-sm">
                    {g.national.map((n) => <li key={n.chunk_id}><span dir="ltr" lang="en" className="block text-start">{n.note}</span>{quote(n.chunk_id)}</li>)}
                  </ul>
                  <h3 className="mt-4 font-mono text-xs tracking-[0.15em] text-ink-soft uppercase"><T k="ub.gap.glob" en="Global examples (in the knowledge base)" /></h3>
                  <ul className="mt-2 space-y-3 text-sm">
                    {g.global.map((x) => (
                      <li key={x.source_id + x.chunk_ids.join()}>
                        <span className={`me-2 rounded-md px-2 py-0.5 font-mono text-xs ${x.support === "primary" ? "bg-paper-deep" : "border border-line"}`}>
                          {x.support === "primary" ? <T k="ub.gap.primary" en="primary text" /> : <T k="ub.gap.secondary" en="secondary summary" />}
                        </span>
                        <bdi dir="ltr" lang="en">{x.note}</bdi>
                        {x.chunk_ids.map((c) => <span key={c}>{quote(c)}</span>)}
                      </li>
                    ))}
                  </ul>
                  {g.not_ingested.length > 0 && (
                    <div className="mt-4 rounded-xl border border-dashed border-line p-3 text-sm">
                      <p className="font-mono text-xs tracking-[0.15em] text-ink-soft uppercase"><T k="ub.gap.noting" en="Not ingested, cited by name only" /></p>
                      <ul className="mt-1">{g.not_ingested.map((n) => <li key={n.name} dir="ltr" lang="en" className="text-start"><strong>{n.name}</strong>: {n.note}</li>)}</ul>
                    </div>
                  )}
                  <h3 className="mt-4 font-mono text-xs tracking-[0.15em] text-ink-soft uppercase"><T k="ub.gap.resp" en="How Prism responds" /></h3>
                  <p dir="ltr" lang="en" className="mt-2 text-start text-sm">{g.prism.response}</p>
                  <ul dir="ltr" className="mt-2 flex flex-wrap gap-2 font-mono text-xs text-ink-soft">
                    {g.prism.refs.map((r) => <li key={r.path + r.label} className="rounded-md bg-paper-deep px-2 py-0.5"><T k={`ub.gap.kind.${r.kind}`} en={r.kind} />: {r.label} ({r.path})</li>)}
                  </ul>
                  <p className="mt-4 text-xs text-ink-soft"><strong><T k="ub.gap.cav" en="Confidence and caveat." /></strong> <span dir="ltr" lang="en">{g.caveat}</span></p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      </LangShell>
    </div>
  );
}
