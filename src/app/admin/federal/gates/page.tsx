import type { Metadata } from "next";
import Link from "next/link";
import type { CountryQuery } from "@/lib/un/country-context";
import { loadCountryUseCases, loadFederalCountry } from "@/lib/un/federal-country";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { requireFederalToolAccess } from "@/lib/un/federal-read-access";
import { permissionsFor } from "@/lib/un/permissions-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { governanceApprovers } from "@/lib/un/approvers";
import { catalogOf, replayGov, verifyGov } from "@/lib/un/gates";
import { rulesetOf } from "@/lib/un/country";
import { loadGovLog } from "@/lib/un/gates-store";
import { GATES } from "@/lib/un/policy";
import { RULESETS } from "@/lib/un/rulesets";
import ToolWorkspace from "../_components/ToolWorkspace";
import WorkspaceSections from "../_components/WorkspaceSections";
import { T, TV } from "../_components/Lang";
import { scrollRegion, Section } from "../_components/ui";
import { GateForm } from "./GateForm";
import { Flag, Ltr, Role, Rs } from "../_components/b-bits";

export const metadata: Metadata = { title: "Gates and rule sets", robots: { index: false, follow: false } };

const DUBAI = { timeZone: "Asia/Dubai" } as const;
const chip = "inline-flex items-center rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[11px]";
const KIND_EN = { gate_added: "Gate added", gate_changed: "Gate changed", use_case_gate: "Gate added to a use case", waiver: "Waiver", rerun: "Verdicts re-run" } as const;

export default async function GatesPage({ searchParams }: { searchParams: Promise<CountryQuery> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/gates");
  if (!profile?.org_id) redirect("/login");
  const { browseCountries } = await requireFederalToolAccess(profile.org_id, user.id, profile.role);
  const { country, state: countryState } = await loadFederalCountry(profile.org_id, (await searchParams).country, browseCountries);
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  const [log, cases] = await Promise.all([loadGovLog(profile.org_id), loadCountryUseCases(profile.org_id, countryState, country.id)]);
  const ok = verifyGov(log);
  const gov = replayGov(log);
  const ruleSet = rulesetOf(country);
  const ids = new Set(cases.map((u) => u.ext_id));
  const gateIds = new Set([
    ...ruleSet.gates, ...(ruleSet.highRisk?.gates ?? []),
    ...Object.entries(gov.custom).filter(([, c]) => c.def.rulesets?.includes(ruleSet.id)).map(([id]) => id),
    ...cases.flatMap((u) => (gov.added[u.ext_id] ?? []).map((g) => g.gate)),
  ]);
  const catalog = Object.fromEntries(Object.entries(catalogOf(gov)).filter(([id]) => gateIds.has(id)));
  const shippedCount = Object.keys(GATES).filter((id) => gateIds.has(id)).length;
  const customCount = Object.keys(catalog).length - shippedCount;
  const reruns = (value: unknown) => ((value ?? []) as { ext_id: string; run_id: string }[]).filter((r) => ids.has(r.ext_id));
  const entries = log.filter(({ kind, payload }) => {
    if (kind === "rerun") return reruns(payload.runs).length > 0;
    if (kind === "use_case_gate" || kind === "waiver") return ids.has(String(payload.ext_id));
    return gateIds.has(String(payload.gate));
  });
  const canEdit = (await permissionsFor(profile, user.id)).can("gate.catalogue.change");
  const requiredBy = (id: string) =>
    RULESETS.filter((r) => r.gates.includes(id) || r.highRisk?.gates.includes(id) || gov.custom[id]?.def.rulesets?.includes(r.id)).map((r) => r.id);

  return (
    <ToolWorkspace country={country} orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="gt.title" en="Gates and rule sets" />}
      description={<T k="workspace.gates.description" en="Review the checks for the selected rule set and the changes recorded in its gate log." />}>

      <WorkspaceSections key={country.id} sections={[
        { id: "gates", label: <T k="gt.s.cat" en="Gate catalogue" />, content: (
            <Section id="gates" title={<T k="gt.s.cat" en="The gate catalogue" />}>
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
                          <span dir="ltr" className="block text-start font-mono text-[11px] text-ink-soft">{id}{g.custom ? ` · v${gov.custom[id].version}` : ""}</span>
                          {g.custom && <span className="block text-xs text-ink-soft"><TV k="gt.signed" en="Signed off by {who}" v={{ who: gov.custom[id].signed_off_by }} /></span>}
                        </th>
                        <td className="pe-3 py-2.5"><T k={`gt.cat.${g.category}`} en={g.category} /></td>
                        <td className="pe-3 py-2.5 text-xs"><Role id={g.owner} /></td>
                        <td className="pe-3 py-2.5 text-xs">
                          <T k={`gt.ev.${g.evidence}`} en={g.evidence} />
                          {g.metric && <span className="block text-ink-soft"><bdi dir="ltr" lang="en">{g.metric.name} {g.metric.op} {g.metric.threshold} {g.metric.unit}</bdi> · <T k="gt.simulated" en="simulated value" /></span>}
                        </td>
                        <td className="pe-3 py-2.5 text-xs text-ink-soft">
                          {(g.requires?.length ?? 0) + (g.clientFacingOnly && !g.requires?.includes("client_facing") ? 1 : 0) === 0 && !g.optional ? <T k="gt.always" en="always" /> : null}
                          {g.clientFacingOnly && <span className={`${chip} me-1`}><Flag id="client_facing" /></span>}
                          {g.requires?.filter((f) => f !== "client_facing").map((f) => <span key={f} className={`${chip} me-1`}><Flag id={f} /></span>)}
                          {g.optional && !g.custom && <T k="gt.optional" en="when a case takes it on" />}
                          {g.custom && !g.requires?.length && <T k="gt.useonly" en="when a use case adds it" />}
                        </td>
                        <td className="pe-4 py-2.5">{requiredBy(id).map((r) => <span key={r} className={`${chip} me-1`}><Rs id={r} /></span>)}{requiredBy(id).length === 0 && <span className="text-xs text-ink-soft"><T k="gt.none" en="no rule set" /></span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-soft"><TV k="gt.count" en="{n} shipped gates, {m} added by administrators." v={{ n: shippedCount, m: customCount }} /></p>
            </Section>
          ) },
        ...(canEdit ? [{ id: "add", label: <T k="gt.s.add" en="Add or change a gate" />, content: (
            <Section id="add" title={<T k="gt.s.add" en="Add or change a gate" />}>
              <GateForm custom={Object.fromEntries(Object.entries(gov.custom).filter(([id]) => gateIds.has(id)).map(([id, c]) => [id, c.def]))} approvers={governanceApprovers()} ruleset={ruleSet.id} />
            </Section>
          ) }] : []),
        { id: "log", label: <T k="gt.s.logt" en="Gate log" />, content: (
            <Section id="log" title={<T k="gt.s.logt" en="Gate log" />}>
              <p className="text-sm text-ink-soft" role="status">
                {ok.ok
                  ? <TV k="workspace.gates.log" en="Chain verified. Entries for this country: {count}." v={{ count: entries.length }} />
                  : <TV k="gt.log.bad" en="Chain broken at entry {n}: {why}" v={{ n: ok.broken_seq, why: ok.reason }} />}
              </p>
              {entries.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft"><T k="gt.log.none" en="No gate has been added or changed yet. The shipped defaults apply." /></p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {[...entries].reverse().map((e) => {
                    const runs = reruns(e.payload.runs);
                    return (
                      <li key={e.seq} className="rounded-2xl border border-line bg-card p-4 text-sm">
                        <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">#{e.seq} · <T k={`gt.k.${e.kind}`} en={KIND_EN[e.kind]} /> · <Ltr>{new Date(e.at).toLocaleString("en-GB", DUBAI)}</Ltr> · <Ltr>{e.actor}</Ltr></p>
                        {(e.kind === "gate_added" || e.kind === "gate_changed") && <p className="mt-1"><span className="font-mono">{String(e.payload.gate)}</span> {e.payload.reason ? `· ${String(e.payload.reason)}` : ""}{e.payload.signed_off_by ? <> · <TV k="gt.waiver.by" en="approved by {who}" v={{ who: String(e.payload.signed_off_by) }} /></> : null}</p>}
                        {e.kind === "use_case_gate" && <p className="mt-1"><span className="font-mono">{String(e.payload.ext_id)}</span> + <span className="font-mono">{String(e.payload.gate)}</span> · {String(e.payload.reason)}{e.payload.approver ? <> · <TV k="gt.waiver.by" en="approved by {who}" v={{ who: String(e.payload.approver) }} /></> : null}</p>}
                        {e.kind === "waiver" && <p className="mt-1"><span className="font-mono">{String(e.payload.ext_id)}</span> − <span className="font-mono">{String(e.payload.gate)}</span> · <TV k="gt.waiver.by" en="approved by {who}" v={{ who: String(e.payload.approver) }} /> · {String(e.payload.reason)}</p>}
                        {e.kind === "rerun" && <p className="mt-1">{runs.map((r) => <Link key={r.run_id} href={`/admin/federal/runs/${r.run_id}`} className="me-3 underline">{r.ext_id}</Link>)}</p>}
                        <code className="mt-1 block text-xs text-ink-soft">{e.hash.slice(0, 16)}…</code>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Section>
          ) }
      ]} />
    </ToolWorkspace>
  );
}
