import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { catalogOf, replayGov, verifyGov } from "@/lib/un/gates";
import { loadGovLog } from "@/lib/un/gates-store";
import { GATES } from "@/lib/un/policy";
import { RULESETS } from "@/lib/un/rulesets";
import AdminHeader from "../../AdminHeader";
import LangShell, { T, TV } from "../_components/Lang";
import { card, scrollRegion, Section } from "../_components/ui";
import { GateForm } from "./GateForm";

export const metadata: Metadata = { title: "Gates and rule sets", robots: { index: false, follow: false } };

const DUBAI = { timeZone: "Asia/Dubai" } as const;
const chip = "inline-flex items-center rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[11px]";
const KIND_EN = { gate_added: "Gate added", gate_changed: "Gate changed", use_case_gate: "Gate added to a use case", waiver: "Waiver", rerun: "Verdicts re-run" } as const;

export default async function GatesPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/gates");
  if (!profile?.org_id) redirect("/login");
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  const entries = await loadGovLog(profile.org_id);
  const ok = verifyGov(entries);
  const gov = replayGov(entries);
  const catalog = catalogOf(gov);
  const canEdit = profile.role === "admin";
  const requiredBy = (id: string) =>
    RULESETS.filter((r) => r.gates.includes(id) || r.highRisk?.gates.includes(id) || gov.custom[id]?.def.rulesets?.includes(r.id)).map((r) => r.id);

  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <LangShell>
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">{canEdit ? <T k="gt.eyebrow" en="Governance" /> : <T k="gt.readonly" en="Read-only" />}</p>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="gt.title" en="Gates and rule sets" /></h1>
          <p className="mt-3 max-w-[68ch] text-base text-ink-soft">
            <T k="gt.lede" en="A gate is a check a use case must clear before it can go live. The nine shipped gates and three rule sets are defaults. An administrator can add gates, functional or non-functional, and a use case can take on gates of its own. A use case can add gates but never drop one its rule set requires. Every change is signed off by an administrator, written to a hash-chained log, and re-runs the affected verdicts as new runs." />{" "}
            <Link href="/admin/federal" className="underline"><T k="sop.back" en="Back to the dashboard" /></Link>
          </p>

          <div className="mt-10 space-y-12">
            <Section id="gates" eyebrow={<T k="gt.s.gates" en="Gates" />} title={<T k="gt.s.cat" en="The gate catalogue" />}>
              <div {...scrollRegion("gt-cap")} className="overflow-x-auto rounded-2xl border border-line bg-card">
                <table className="w-full min-w-[52rem] text-sm">
                  <caption id="gt-cap" className="sr-only"><T k="gt.cap" en="Gates with category, owner, evidence source and the rule sets that require them" /></caption>
                  <thead className="text-start font-mono text-[11px] tracking-wide text-ink-soft uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-start font-normal"><T k="gt.col.gate" en="Gate" /></th>
                      <th scope="col" className="text-start font-normal"><T k="gt.col.cat" en="Category" /></th>
                      <th scope="col" className="text-start font-normal"><T k="gt.col.owner" en="Owner" /></th>
                      <th scope="col" className="text-start font-normal"><T k="gt.col.ev" en="Evidence" /></th>
                      <th scope="col" className="text-start font-normal"><T k="gt.col.applies" en="Applies when" /></th>
                      <th scope="col" className="pe-4 text-start font-normal"><T k="gt.col.rs" en="Required by" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(catalog).map(([id, g]) => (
                      <tr key={id} className="border-t border-line align-top">
                        <th scope="row" className="px-4 py-2.5 text-start font-normal">
                          <span className="block font-medium"><T k={`gate.${id}`} en={g.label} /></span>
                          <span className="block font-mono text-[11px] text-ink-soft">{id}{g.custom ? ` · v${gov.custom[id].version}` : ""}</span>
                          {g.custom && <span className="block text-xs text-ink-soft"><TV k="gt.signed" en="Signed off by {who}" v={{ who: gov.custom[id].signed_off_by }} /></span>}
                        </th>
                        <td className="pe-3 py-2.5"><T k={`gt.cat.${g.category}`} en={g.category} /></td>
                        <td className="pe-3 py-2.5 font-mono text-xs">{g.owner}</td>
                        <td className="pe-3 py-2.5 text-xs">
                          <T k={`gt.ev.${g.evidence}`} en={g.evidence} />
                          {g.metric && <span className="block text-ink-soft">{g.metric.name} {g.metric.op} {g.metric.threshold} {g.metric.unit} · <T k="gt.simulated" en="simulated value" /></span>}
                        </td>
                        <td className="pe-3 py-2.5 text-xs text-ink-soft">
                          {(g.requires?.length ?? 0) + (g.clientFacingOnly && !g.requires?.includes("client_facing") ? 1 : 0) === 0 && !g.optional ? <T k="gt.always" en="always" /> : null}
                          {g.clientFacingOnly && <span className={`${chip} me-1`}>client_facing</span>}
                          {g.requires?.filter((f) => f !== "client_facing").map((f) => <span key={f} className={`${chip} me-1`}>{f}</span>)}
                          {g.optional && !g.custom && <T k="gt.optional" en="when a case takes it on" />}
                          {g.custom && !g.requires?.length && <T k="gt.useonly" en="when a use case adds it" />}
                        </td>
                        <td className="pe-4 py-2.5">{requiredBy(id).map((r) => <span key={r} className={`${chip} me-1`}>{r}</span>)}{requiredBy(id).length === 0 && <span className="text-xs text-ink-soft"><T k="gt.none" en="no rule set" /></span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-soft"><TV k="gt.count" en="{n} shipped gates, {m} added by administrators." v={{ n: Object.keys(GATES).length, m: Object.keys(gov.custom).length }} /></p>
            </Section>

            <Section id="add" eyebrow={<T k="gt.eyebrow" en="Governance" />} title={<T k="gt.s.add" en="Add or change a gate" />}>
              {canEdit ? (
                <div className={card}><GateForm custom={Object.fromEntries(Object.entries(gov.custom).map(([id, c]) => [id, c.def]))} /></div>
              ) : (
                <p className="text-sm text-ink-soft"><T k="gt.viewer" en="Adding and changing gates needs an administrator. Viewers and judges can read everything here." /></p>
              )}
            </Section>

            <Section id="log" eyebrow={<T k="gt.s.log" en="Log" />} title={<T k="gt.s.logt" en="Gate log" />}>
              <p className="text-sm text-ink-soft" role="status">
                {ok.ok
                  ? <TV k="gt.log.ok" en="Chain verified: {n} entries, intact." v={{ n: entries.length }} />
                  : <TV k="gt.log.bad" en="Chain broken at entry {n}: {why}" v={{ n: ok.broken_seq, why: ok.reason }} />}
              </p>
              {entries.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft"><T k="gt.log.none" en="No gate has been added or changed yet. The shipped defaults apply." /></p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {[...entries].reverse().map((e) => {
                    const runs = (e.payload.runs as { ext_id: string; run_id: string }[] | undefined) ?? [];
                    return (
                      <li key={e.seq} className="rounded-2xl border border-line bg-card p-4 text-sm">
                        <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">#{e.seq} · <T k={`gt.k.${e.kind}`} en={KIND_EN[e.kind]} /> · {new Date(e.at).toLocaleString("en-GB", DUBAI)} · {e.actor}</p>
                        {(e.kind === "gate_added" || e.kind === "gate_changed") && <p className="mt-1"><span className="font-mono">{String(e.payload.gate)}</span> {e.payload.reason ? `· ${String(e.payload.reason)}` : ""}</p>}
                        {e.kind === "use_case_gate" && <p className="mt-1"><span className="font-mono">{String(e.payload.ext_id)}</span> + <span className="font-mono">{String(e.payload.gate)}</span> · {String(e.payload.reason)}</p>}
                        {e.kind === "waiver" && <p className="mt-1"><span className="font-mono">{String(e.payload.ext_id)}</span> − <span className="font-mono">{String(e.payload.gate)}</span> · <TV k="gt.waiver.by" en="approved by {who}" v={{ who: String(e.payload.approver) }} /> · {String(e.payload.reason)}</p>}
                        {e.kind === "rerun" && <p className="mt-1">{runs.map((r) => <Link key={r.run_id} href={`/admin/federal/runs/${r.run_id}`} className="me-3 underline">{r.ext_id}</Link>)}</p>}
                        <code className="mt-1 block text-xs text-ink-soft">{e.hash.slice(0, 16)}…</code>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Section>
          </div>
        </main>
      </LangShell>
    </div>
  );
}
