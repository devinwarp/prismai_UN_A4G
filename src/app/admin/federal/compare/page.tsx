import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadChunks } from "@/lib/un/kb";
import { parseUseCases } from "@/lib/un/model";
import { compareProcesses, flatEvidence, s1EvidenceAt, type ProcessInput } from "@/lib/un/compare";
import { GATES } from "@/lib/un/policy";
import { DERIVED_GAPS, RULESETS } from "@/lib/un/rulesets";
import AdminHeader from "../../AdminHeader";
import { T } from "../_components/Lang";

export const metadata: Metadata = { title: "Compare business processes", robots: { index: false, follow: false } };

const STEPS = ["T0", "T1", "T2", "T3", "T4"];
const VERDICT_TONE: Record<string, string> = { NO_GO: "bg-red-100 text-red-900", ESCALATE: "bg-amber-100 text-amber-900", ASSISTANT_ONLY: "bg-amber-50 text-amber-900", GO_SUPERVISED: "bg-emerald-50 text-emerald-900", GO_AUTONOMOUS: "bg-emerald-100 text-emerald-900" };
const SHORT: Record<string, string> = { "uae-federal": "UAE federal", "eu-ai-act": "EU AI Act", "sg-imda": "Singapore IMDA" };
const KEY: Record<string, string> = { "uae-federal": "uae", "eu-ai-act": "eu", "sg-imda": "sg" };
const DEFAULT_PICK = ["UC02", "UC03", "UC06", "UC08", "UC09", "UC13"];
const DEFAULT_RIGHTS = ["UC09", "UC13"];
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/compare");
  if (!profile?.org_id) redirect("/login");
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();

  const all = parseUseCases(readFileSync(path.join(process.cwd(), "data", "un-use-cases.csv"), "utf8")).useCases;
  const submitted = one(sp.f) === "1";
  const ids = new Set(all.map((u) => u.ext_id));
  const pick = (submitted ? many(sp.uc) : DEFAULT_PICK).filter((x) => ids.has(x));
  const rightsSet = new Set(submitted ? many(sp.rights) : DEFAULT_RIGHTS);
  const jKey = one(sp.j) ?? "uae";
  const rs = RULESETS.find((r) => KEY[r.id] === jKey) ?? RULESETS[0];
  const step = STEPS.includes(one(sp.step) ?? "") ? one(sp.step)! : "T1";
  const allPass = one(sp.ev) === "pass";
  const chosen = all.filter((u) => pick.includes(u.ext_id));

  const inputs: ProcessInput[] = chosen.map((u) => {
    const ev = u.ext_id === "UC02" ? s1EvidenceAt(step) : { gates: flatEvidence(allPass), hitlUnmet: [] };
    return { id: u.ext_id, entity: u.entity, facts: { client_facing: u.client_facing, affects_rights: rightsSet.has(u.ext_id) || u.affects_rights, irreversible: u.irreversible }, requested: "GO_AUTONOMOUS", ...ev };
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
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">Read-only</p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="compare.title" en="Business processes under one policy" /></h1>
        <p role="note" className="mt-3 max-w-[68ch] rounded-xl border border-dashed border-line p-3 text-sm">
          The rule sets are <strong>simplified demo encodings, not legal advice</strong>. They map a few ingested provisions onto
          Prism&apos;s gate vocabulary. <Link href="/admin/federal" className="underline">Back to the dashboard</Link>
        </p>

        <nav aria-label="Policy layer" className="mt-5">
          <p className="font-mono text-xs text-ink-soft uppercase"><T k="compare.policy" en="Policy layer (country target and rules)" /></p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {RULESETS.map((r) => (
              <li key={r.id}>
                <Link href={qs(KEY[r.id])} aria-current={r.id === rs.id ? "page" : undefined}
                  className={`inline-block rounded-full border px-4 py-1.5 ${r.id === rs.id ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper-deep"}`}>{SHORT[r.id]}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <ol className="mt-4 flex flex-wrap items-center gap-2 text-xs" aria-label="How the policy cascades">
          {["Policy target (" + SHORT[rs.id] + ")", "Entity rules", "Process attributes", "Gates", "Verdict"].map((x, i) => (
            <li key={x} className="flex items-center gap-2"><span className="rounded-full border border-line bg-card px-3 py-1">{x}</span>{i < 4 && <span aria-hidden className="text-ink-soft rtl:rotate-180">→</span>}</li>
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

        <h2 className="font-display mt-8 text-2xl font-medium tracking-tight">Processes under {SHORT[rs.id]}</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Autonomy requested for every process: GO_AUTONOMOUS. Evidence: UC02 follows staged scenario S1 up to {step} (synthetic); other processes have {allPass ? "every gate passed" : "no evidence yet"}.
          {!isUae && ` ${changed} of ${rows.length} verdicts differ from UAE.`}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[60rem] text-start text-sm">
            <thead><tr className="font-mono text-xs text-ink-soft uppercase">
              <th className="py-1 pe-3 text-start">Process</th><th className="px-3 text-start">Attributes</th><th className="px-3 text-start">Gates required</th>
              <th className="px-3 text-start">Autonomy cap</th><th className="px-3 text-start">Evidence</th><th className="px-3 text-start">Verdict</th><th className="ps-3 text-start">Why</th>
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
                return (
                  <tr key={r.input.id} className="border-t border-line align-top">
                    <td className="py-2 pe-3"><span className="font-mono text-xs">{r.input.id}</span> {u.title}<br /><span className="text-xs text-ink-soft">{u.entity}</span></td>
                    <td className="px-3"><div className="flex flex-wrap gap-1">
                      {f.client_facing && <span className={chip}>client-facing</span>}{f.affects_rights && <span className={chip}>rights</span>}{f.irreversible && <span className={chip}>irreversible</span>}
                      {!f.client_facing && !f.affects_rights && !f.irreversible && <span className="text-xs text-ink-soft">none</span>}
                    </div></td>
                    <td className="px-3"><div className="flex max-w-[16rem] flex-wrap gap-1">
                      {r.required.map((g) => <span key={g} title={GATES[g].label} className={`${chip} ${r.addedByAttributes.includes(g) ? "bg-amber-100 font-bold" : ""}`}>{g}</span>)}
                    </div></td>
                    <td className="px-3 font-mono text-xs">{r.capped ? "GO_SUPERVISED" : "none"}</td>
                    <td className="px-3 text-xs">{r.input.id === "UC02" ? `S1 ${step}` : allPass ? "all gates pass" : "no evidence yet"}</td>
                    <td className="px-3"><span className={`inline-block rounded-md px-2 py-0.5 font-mono text-xs ${VERDICT_TONE[r.decision.verdict] ?? "bg-paper-deep"}`}>{r.decision.verdict}</span>
                      {diff && <p className="mt-1 text-xs text-amber-900">vs UAE: {r.uae.verdict} → {r.decision.verdict}</p>}</td>
                    <td className="ps-3 text-xs">{r.decision.reasons[0]}{note.length > 0 && <><br /><span className="text-ink-soft">{note.join("; ")}.</span></>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="mt-2 text-sm">No processes selected.</p>}
        <p className="mt-2 text-xs text-ink-soft">Highlighted gates are required because of the process attributes. {rs.notIngested.length > 0 && `Cited by name only, not ingested: ${rs.notIngested.join("; ")}.`} Sources: {cites(Object.values(rs.cites).flat())}{rs.highRisk && cites(rs.highRisk.cites)}</p>

        <h2 className="font-display mt-8 text-2xl font-medium tracking-tight">Resulting gaps</h2>
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
    </div>
  );
}
