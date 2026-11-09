import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadChunks } from "@/lib/un/kb";
import { GAP_CATEGORIES, loadGaps } from "@/lib/un/gaps";
import AdminHeader from "../../AdminHeader";

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
      <blockquote className="mt-1 border-l-2 border-line pl-3 text-xs text-ink-soft">
        {c.text.length > 320 ? `${c.text.slice(0, 320)}…` : c.text}
        <span className="mt-1 block font-mono">{id} · <a href={c.url} className="underline">{c.title}</a></span>
      </blockquote>
    ) : null;
  };
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">Read-only</p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl">{f.title}</h1>
        <p className="mt-3 max-w-[68ch] text-sm text-ink-soft">
          {f.scope} <Link href="/admin/federal" className="underline">Back to the dashboard</Link>
        </p>
        <nav aria-label="Gap categories" className="mt-5 flex flex-wrap gap-2 text-xs">
          {GAP_CATEGORIES.map((c) => (
            <a key={c} href={`#${c}`} className="rounded-full border border-line px-3 py-1 hover:border-ink-soft hover:bg-paper-deep">{f.categories[c]}</a>
          ))}
        </nav>
        {GAP_CATEGORIES.map((cat) => (
          <section key={cat} id={cat} aria-labelledby={`h-${cat}`}>
            <h2 id={`h-${cat}`} className="font-display mt-10 text-2xl font-medium tracking-tight">{f.categories[cat]}</h2>
            <ul className="mt-4 grid gap-4">
              {f.gaps.filter((g) => g.category === cat).map((g) => (
                <li key={g.id} className="rounded-2xl border border-line bg-card p-5 sm:p-6">
                  <p className="font-mono text-xs"><span className="rounded-md bg-paper-deep px-2 py-0.5 font-medium text-ink">{g.id}</span></p>
                  <p className="font-display mt-2 text-xl">{g.statement}</p>
                  <h3 className="mt-4 font-mono text-xs tracking-[0.15em] text-ink-soft uppercase">What the national sources say</h3>
                  <ul className="mt-2 space-y-3 text-sm">
                    {g.national.map((n) => <li key={n.chunk_id}>{n.note}{quote(n.chunk_id)}</li>)}
                  </ul>
                  <h3 className="mt-4 font-mono text-xs tracking-[0.15em] text-ink-soft uppercase">Global examples (in the knowledge base)</h3>
                  <ul className="mt-2 space-y-3 text-sm">
                    {g.global.map((x) => (
                      <li key={x.source_id + x.chunk_ids.join()}>
                        <span className={`mr-2 rounded-md px-2 py-0.5 font-mono text-xs ${x.support === "primary" ? "bg-paper-deep" : "border border-line"}`}>
                          {x.support === "primary" ? "primary text" : "secondary summary"}
                        </span>
                        {x.note}
                        {x.chunk_ids.map((c) => <span key={c}>{quote(c)}</span>)}
                      </li>
                    ))}
                  </ul>
                  {g.not_ingested.length > 0 && (
                    <div className="mt-4 rounded-xl border border-dashed border-line p-3 text-sm">
                      <p className="font-mono text-xs tracking-[0.15em] text-ink-soft uppercase">Not ingested, cited by name only</p>
                      <ul className="mt-1">{g.not_ingested.map((n) => <li key={n.name}><strong>{n.name}</strong>: {n.note}</li>)}</ul>
                    </div>
                  )}
                  <h3 className="mt-4 font-mono text-xs tracking-[0.15em] text-ink-soft uppercase">How Prism responds</h3>
                  <p className="mt-2 text-sm">{g.prism.response}</p>
                  <ul className="mt-2 flex flex-wrap gap-2 font-mono text-xs text-ink-soft">
                    {g.prism.refs.map((r) => <li key={r.path + r.label} className="rounded-md bg-paper-deep px-2 py-0.5">{r.kind}: {r.label} ({r.path})</li>)}
                  </ul>
                  <p className="mt-4 text-xs text-ink-soft"><strong>Confidence and caveat.</strong> {g.caveat}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
