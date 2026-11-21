import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadChunks } from "@/lib/un/kb";
import { parseUseCases } from "@/lib/un/model";
import { loadUnUseCases } from "@/lib/un/store";
import { effectiveGates } from "@/lib/un/gates";
import { loadGov } from "@/lib/un/gates-store";
import { compareProcesses, flatEvidence, s1EvidenceAt, type ProcessInput } from "@/lib/un/compare";
import { GATES } from "@/lib/un/policy";
import { DERIVED_GAPS, RULESETS } from "@/lib/un/rulesets";
import AdminHeader from "../../AdminHeader";
import LangShell, { T, TV } from "../_components/Lang";
import { VerdictBadge } from "../_components/ui";

export const metadata: Metadata = { title: "Compare business processes", robots: { index: false, follow: false } };

const STEPS = ["T0", "T1", "T2", "T3", "T4"];
const SHORT: Record<string, string> = { "uae-federal": "UAE federal", "eu-ai-act": "EU AI Act", "sg-imda": "Singapore IMDA" };
const KEY: Record<string, string> = { "uae-federal": "uae", "eu-ai-act": "eu", "sg-imda": "sg" };
const DEFAULT_PICK = ["UC02", "UC03", "UC06", "UC08", "UC09", "UC13"];
// Fallback only: the rights flag now lives in data/un-use-cases.csv (affects_rights column).
// This list applies solely to a use case whose row carries no such column (an old CSV).
const FALLBACK_RIGHTS = ["UC09", "UC13"];
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/compare");
  if (!profile?.org_id) redirect("/login");
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();

  // Promoted SOP rows (SOP-*) sit beside the CSV rows; see /admin/federal/sop.
  const sop = (await loadUnUseCases(profile.org_id)).filter((u) => u.ext_id.startsWith("SOP-"));
  const all = [...parseUseCases(readFileSync(path.join(process.cwd(), "data", "un-use-cases.csv"), "utf8")).useCases, ...sop];
  const submitted = one(sp.f) === "1";
  const ids = new Set(all.map((u) => u.ext_id));
  const pick = (submitted ? many(sp.uc) : [...DEFAULT_PICK, ...sop.map((u) => u.ext_id)]).filter((x) => ids.has(x));
  const dataRights = (u: { ext_id: string; affects_rights?: boolean }) => u.affects_rights ?? FALLBACK_RIGHTS.includes(u.ext_id);
  const rightsSet = new Set(submitted ? many(sp.rights) : all.filter(dataRights).map((u) => u.ext_id));
  const jKey = one(sp.j) ?? "uae";
  const rs = RULESETS.find((r) => KEY[r.id] === jKey) ?? RULESETS[0];
  const step = STEPS.includes(one(sp.step) ?? "") ? one(sp.step)! : "T1";
  const allPass = one(sp.ev) === "pass";
  const chosen = all.filter((u) => pick.includes(u.ext_id));

  const gov = await loadGov(profile.org_id);
  const inputs: ProcessInput[] = chosen.map((u) => {
    const ev = u.ext_id === "UC02" ? s1EvidenceAt(step) : { gates: flatEvidence(allPass), hitlUnmet: [] };
    const facts = { client_facing: u.client_facing, affects_rights: rightsSet.has(u.ext_id), irreversible: u.irreversible };
    const eff = effectiveGates({ ext: u.ext_id, facts, ruleset: rs, gov });
    return { id: u.ext_id, entity: u.entity, facts, requested: "GO_AUTONOMOUS", ...ev, useCaseGates: eff.added, catalog: eff.catalog };
  });
  const rows = compareProcesses(rs, inputs);
  const isUae = rs.id === "uae-federal";
  const changed = rows.filter((r) => r.decision.verdict !== r.uae.verdict).length;

  const qs = (j: string) => {
    const q = new URLSearchParams({ j, f: "1", step, ev: allPass ? "pass" : "none" });
    pick.forEach((x) => q.append("uc", x));
    rightsSet.forEach((x) => q.append("rights", x));
    return `?${q}`;
  };
  const chunk = new Map(loadChunks().map((k) => [k.chunk_id, k]));
  const cites = (ids: string[]) => ids.map((id) => <span key={id} title={chunk.get(id)?.text} className="me-1 rounded bg-paper-deep px-1 font-mono text-[11px]">{id}</span>);
  const gaps = DERIVED_GAPS.filter((g) => g.ruleset === rs.id);
  const chip = "rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[11px]";

  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">Read-only</p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="compare.title" en="Business processes under one policy" /></h1>
        <p role="note" className="mt-3 max-w-[68ch] rounded-xl border border-dashed border-line p-3 text-sm">
          The rule sets are <strong>simplified demo encodings, not legal advice</strong>. They map a few ingested provisions onto
          Prism&apos;s gate vocabulary. <Link href="/admin/federal" className="underline">Back to the dashboard</Link>
        </p>

        <nav aria-label="Policy layer" className="mt-5">
          <p className="font-mono text-xs text-ink-soft uppercase"><T k="compare.policy" en="Policy layer (country target and rules)" /></p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm" data-tour="jurisdiction">
            {RULESETS.map((r) => (
              <li key={r.id}>
                <Link href={qs(KEY[r.id])} aria-current={r.id === rs.id ? "page" : undefined}
                  className={`inline-block rounded-full border px-5 py-2 text-base ${r.id === rs.id ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper-deep"}`}>{SHORT[r.id]}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <ol className="mt-6 grid gap-y-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="How the policy cascades">
          {[
            { k: "casc.1", t: `Policy target (${SHORT[rs.id]})`, h: "The country sets the goal and the rules." },
            { k: "casc.2", t: "Entity rules", h: "Each entity can add its own human-oversight rules." },
            { k: "casc.3", t: "Process attributes", h: "Client-facing? Affects rights? Irreversible?" },
            { k: "casc.4", t: "Checks", h: "Those facts decide which checks are required." },
            { k: "casc.5", t: "Decision", h: "Evidence against the checks gives the decision." },
          ].map((x, i) => (
            <li key={x.k} className="relative flex gap-3 pe-4">
              <span aria-hidden className="font-display text-3xl leading-none text-lit tabular-nums">{i + 1}</span>
              <div>
                <p className="text-base font-medium"><T k={x.k} en={x.t} /></p>
                <p className="mt-0.5 text-sm text-ink-soft"><T k={`${x.k}.h`} en={x.h} /></p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-ink-soft">
          Active: <strong>{rs.name}</strong>. Cap: {rs.capAutonomy === "always" ? "every process is capped at GO_SUPERVISED" : "client-facing processes are capped at GO_SUPERVISED"}.
          Base gates: {rs.gates.map((g) => <span key={g} className={`${chip} me-1`}>{g}</span>)}
          {rs.highRisk && <> Rights-affecting processes escalate: {rs.highRisk.label}.</>}
        </p>

        <details className="mt-5 rounded-xl border border-line bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">Choose processes and evidence</summary>
          <form method="get" className="mt-3">
            <input type="hidden" name="f" value="1" /><input type="hidden" name="j" value={KEY[rs.id]} />
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {all.map((u) => (
                <li key={u.ext_id} className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2"><input type="checkbox" name="uc" value={u.ext_id} defaultChecked={pick.includes(u.ext_id)} /> {u.ext_id} {u.title}</label>
                  <label className="ms-auto flex items-center gap-1 text-xs text-ink-soft"><input type="checkbox" name="rights" value={u.ext_id} defaultChecked={rightsSet.has(u.ext_id)} /> affects rights</label>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <label>UC02 evidence (staged scenario S1)<br />
                <select name="step" defaultValue={step} className="rounded-md border border-line bg-card px-2 py-1">{STEPS.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
              <label>Other processes<br />
                <select name="ev" defaultValue={allPass ? "pass" : "none"} className="rounded-md border border-line bg-card px-2 py-1">
                  <option value="none">No evidence yet</option><option value="pass">All gates pass</option>
                </select>
              </label>
              <button className="rounded-full border border-line px-3 py-1 hover:bg-paper-deep">Apply</button>
            </div>
          </form>
        </details>

        <h2 className="font-display mt-10 text-3xl font-medium tracking-tight">Processes under {SHORT[rs.id]}</h2>
        {isUae ? (
          <p className="mt-2 max-w-[68ch] text-base text-ink-soft">This is the baseline. Switch to another policy above to see which decisions change.</p>
        ) : (
          <p role="status" className="mt-3 max-w-[68ch] rounded-xl border-2 p-4 text-lg font-medium" style={{ borderColor: changed ? "var(--color-ember)" : "var(--color-line)" }}>
            <span aria-hidden>{changed ? "▲ " : "= "}</span>{changed ? `${changed} of ${rows.length} decisions change under ${SHORT[rs.id]} compared with UAE.` : `No decision changes under ${SHORT[rs.id]} for these processes.`}
          </p>
        )}
        <p className="mt-2 text-sm text-ink-soft">
          Every process asks for GO_AUTONOMOUS. UC02 follows staged scenario S1 up to {step} (synthetic); other processes have {allPass ? "every check passed" : "no evidence yet"}.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="proj w-full min-w-[52rem] border-separate border-spacing-y-2 text-start">
            <caption className="sr-only">Decision per process under {SHORT[rs.id]}</caption>
            <thead><tr className="font-mono text-xs text-ink-soft uppercase">
              <th scope="col" className="px-3 text-start font-normal">Process</th><th scope="col" className="px-3 text-start font-normal">Decision</th><th scope="col" className="px-3 text-start font-normal">Why</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const f = r.input.facts;
                const u = chosen.find((x) => x.ext_id === r.input.id)!;
                const diff = r.decision.verdict !== r.uae.verdict;
                const note: string[] = [];
                if (f.client_facing) note.push("client-facing: capped at GO_SUPERVISED");
                else if (r.capped) note.push("this policy caps every process at GO_SUPERVISED");
                if (r.highRisk) note.push(`rights-affecting: high-risk tier${r.addedByAttributes.length ? ", adds " + r.addedByAttributes.join(", ") : ""}`);
                else if (f.client_facing && r.addedByAttributes.length) note.push(`client-facing: adds ${r.addedByAttributes.join(", ")}`);
                if (f.irreversible) note.push("irreversible: needs human approval");
                const cell = `bg-card px-3 py-3 align-top first:rounded-s-xl last:rounded-e-xl ${diff ? "border-y-2 border-ember first:border-s-2 last:border-e-2" : "border-y border-line first:border-s last:border-e"}`;
                return (
                  <tr key={r.input.id}>
                    <td className={`${cell} w-[30%]`}><span className="font-mono text-xs">{r.input.id}</span> <span className="font-medium">{u.title}</span><br /><span className="text-sm text-ink-soft">{u.entity}</span>
                      {r.gatesAdded > 0 && <><br /><span className={`${chip} mt-1 inline-block`} title="This process is judged under more gates than the shipped rule set, so compare its figures with care."><span aria-hidden>+ </span><TV k="gt.added" en="{n} gates added" v={{ n: r.gatesAdded }} /></span></>}</td>
                    <td className={`${cell} w-[24%]`}>
                      <VerdictBadge verdict={r.decision.verdict as never} size="lg" />
                      {diff && <p className="mt-2 text-sm font-medium text-ember"><span aria-hidden>▲ </span>Changed. UAE: <span className="font-mono">{r.uae.verdict}</span></p>}
                    </td>
                    <td className={`${cell} text-sm`}>
                      {r.decision.reasons[0]}
                      <details className="mt-2">
                        <summary className="w-fit cursor-pointer text-ink-soft underline underline-offset-2">How it was worked out</summary>
                        <div className="mt-2 space-y-2">
                          <p><span className="font-mono text-[11px] text-ink-soft uppercase">Attributes </span>
                            {f.client_facing && <span className={chip}>client-facing</span>} {f.affects_rights && <span className={chip}>rights</span>} {f.irreversible && <span className={chip}>irreversible</span>}
                            {!f.client_facing && !f.affects_rights && !f.irreversible && "none"}</p>
                          <p><span className="font-mono text-[11px] text-ink-soft uppercase">Required checks </span>
                            {r.required.map((g) => <span key={g} title={r.input.catalog?.[g]?.label ?? GATES[g]?.label} className={`${chip} me-1 ${r.addedByAttributes.includes(g) ? "bg-ember/15 font-semibold" : ""}`}>{r.addedByAttributes.includes(g) ? "+ " : ""}{g}</span>)}</p>
                          <p><span className="font-mono text-[11px] text-ink-soft uppercase">Autonomy cap </span><span className="font-mono text-xs">{r.capped ? "GO_SUPERVISED" : "none"}</span> · <span className="text-ink-soft">{r.input.id === "UC02" ? `evidence S1 ${step}` : allPass ? "all checks pass" : "no evidence yet"}</span></p>
                          {note.length > 0 && <p className="text-ink-soft">{note.join("; ")}.</p>}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="mt-2 text-sm">No processes selected.</p>}
        <p className="mt-2 text-xs text-ink-soft">Checks marked + are required because of the process attributes. {rs.notIngested.length > 0 && `Cited by name only, not ingested: ${rs.notIngested.join("; ")}.`} Sources: {cites(Object.values(rs.cites).flatMap((c) => c ?? []))}{rs.highRisk && cites(rs.highRisk.cites)}</p>

        <h2 className="font-display mt-10 text-3xl font-medium tracking-tight">Resulting gaps</h2>
        <p className="mt-1 text-xs text-ink-soft">Curated gaps this policy touches, linked to <Link href="/admin/federal/gaps" className="underline">the gap page</Link>, then gaps derived by this comparison (not in kb/gaps.json).</p>
        <ul className="mt-3 flex flex-wrap gap-2 font-mono text-xs">
          {[...rs.gapIds].sort().map((id) => <li key={id}><Link href={`/admin/federal/gaps#${id}`} className="rounded-md bg-paper-deep px-2 py-0.5 underline">{id}</Link></li>)}
        </ul>
        <ul className="mt-4 grid gap-3">
          {gaps.map((g) => (
            <li key={g.id} className="rounded-xl border border-line bg-card p-3 text-sm">
              <span className="font-mono text-xs"><span className="rounded-md bg-paper-deep px-2 py-0.5">{g.id}</span> derived · {g.ruleset} · extends {g.relatesTo.join(", ")}</span>
              <p className="mt-1">{g.statement}</p>
              <p className="mt-1">{cites(g.chunk_ids)}</p>
            </li>
          ))}
        </ul>
      </main>
      </LangShell>
    </div>
  );
}
