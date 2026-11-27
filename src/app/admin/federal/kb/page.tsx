import { isOrgAdmin } from "@/lib/roles";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getUserAndProfile } from "@/lib/auth";
import { requireFederalToolAccess } from "@/lib/un/federal-read-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { scopeOf } from "@/lib/un/country-actions";
import { countryHref, type CountryQuery } from "@/lib/un/country-context";
import { loadFederalCountry } from "@/lib/un/federal-country";
import ToolWorkspace, { WorkspacePane } from "../_components/ToolWorkspace";
import { T } from "../_components/Lang";
import { ArOnly } from "../_components/b-bits";
import KbSearch, { type SourceMeta } from "./KbSearch";

export const metadata: Metadata = { title: "Knowledge base", robots: { index: false, follow: false } };

export default async function KbPage({ searchParams }: { searchParams: Promise<CountryQuery> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/kb");
  if (!profile?.org_id) redirect("/login");
  const { browseCountries } = await requireFederalToolAccess(profile.org_id, user.id, profile.role);
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), "kb", "sources.json"), "utf8")) as Record<string, unknown>[];
  const { country, deps, state } = await loadFederalCountry(profile.org_id, (await searchParams).country, browseCountries);
  const chunks = await scopeOf(deps, state, country.id);
  const sourcesById = new Map<string, SourceMeta>();
  const lockedHashes = new Map(raw.map((source) => [String(source.id), typeof source.source_sha256 === "string" ? source.source_sha256 : ""]));
  for (const source of state.policies[country.id]?.sources ?? []) lockedHashes.set(source.id, source.sha256);
  const section: Record<string, string> = {};
  for (const c of chunks ?? []) {
    const source = sourcesById.get(c.source_id);
    if (source) source.chunks += 1;
    else sourcesById.set(c.source_id, {
      id: c.source_id, title: c.title, url: c.url, issuer: c.issuer, jurisdiction: c.jurisdiction,
      instrument_type: c.instrument_type, binding: c.binding, date: c.date,
      sha256: lockedHashes.get(c.source_id) ?? "", chunks: 1,
    });
    section[c.chunk_id] = c.text.match(/\(([^()]*)\)\s*$/)?.[1] ?? "";
  }
  const sources = [...sourcesById.values()];
  return (
    <ToolWorkspace country={country} orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="ub.kb.title" en="Knowledge base explorer" />}
      description={<><T k="ub.kb.lede" en="Every answer in Prism cites a chunk from this knowledge base. Search it directly." /> <ArOnly><T k="ub.kb.ennote" en="" /></ArOnly></>}>
      {chunks ? <KbSearch key={country.id} country={country.id} sources={sources} sections={section} /> : (
        <WorkspacePane id="kb-unavailable" title={<T k="cn.scope" en="Knowledge base" />}>
          <p className="text-sm text-ink-soft"><T k="kb.country.empty" en="The knowledge base for this country is awaiting policy documents." />{" "}
            {isOrgAdmin(profile.role) && <Link className="underline" href={countryHref("/admin/federal/country?setup=" + country.id, country.id)}><T k="ua.pg.nokb.go" en="Set up this country" /></Link>}
          </p>
        </WorkspacePane>
      )}
    </ToolWorkspace>
  );
}
