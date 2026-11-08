"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import HitlEditor from "./HitlEditor";
import ImportCsv from "./_components/ImportCsv";
import {
  QuadrantVerdictMatrix, StagePipeline, TallyList, TargetProgress, VerdictMix, type VerdictFilter,
} from "./_components/charts";
import { VerdictBadge, VERDICT_META, Section, Field, btnPrimary, card, field } from "./_components/ui";
import type { HitlConfig } from "@/lib/un/hitl";
import { deadlineText, STAGES, VERDICTS, type Dashboard, type Policy, type UnUseCaseState, type Verdict } from "@/lib/un/model";

async function send(url: string, method: string, body: string, type: string) {
  const res = await fetch(url, { method, body, headers: { "Content-Type": type } });
  const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[] };
  return { ok: res.ok, data };
}

const NAV: [string, string][] = [
  ["progress", "Progress"],
  ["portfolio", "Portfolio"],
  ["use-cases", "Use cases"],
  ["policy", "Policy"],
  ["import", "Import"],
  ["hitl", "Oversight rules"],
];

export default function FederalPanel({
  policy, dashboard: d, useCases, canEdit, hitl, asOf,
}: {
  policy: Policy;
  dashboard: Dashboard;
  useCases: UnUseCaseState[];
  canEdit: boolean;
  hitl: HitlConfig;
  asOf: string;
}) {
  const router = useRouter();
  const [p, setP] = useState(policy);
  const [savedPolicy, setSavedPolicy] = useState(policy);
  const [policyMsg, setPolicyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rowMsg, setRowMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAllEntities, setShowAllEntities] = useState(false);

  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [verdict, setVerdict] = useState<VerdictFilter | "all">("all");
  const [stage, setStage] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return useCases.filter(
      (u) =>
        (!needle || `${u.ext_id} ${u.title} ${u.entity}`.toLowerCase().includes(needle)) &&
        (!entity || u.entity === entity) &&
        (!stage || u.stage === stage) &&
        (verdict === "all" || (verdict === "NONE" ? !u.verdict : u.verdict === verdict)),
    );
  }, [useCases, q, entity, verdict, stage]);
  const filtering = Boolean(q || entity || stage || verdict !== "all");
  const clear = () => { setQ(""); setEntity(""); setStage(""); setVerdict("all"); };
  const pick = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); document.getElementById("use-cases")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  // Policy form: inline validation, dirty tracking.
  const pErr = {
    name: p.name.trim() ? null : "A policy needs a name.",
    target: Number.isInteger(p.target_percent) && p.target_percent >= 0 && p.target_percent <= 100 ? null : "Enter a whole number from 0 to 100.",
    counting: p.counting_verdicts.length ? null : "Pick at least one verdict, or nothing can count as deployed.",
  };
  const policyInvalid = Object.values(pErr).some(Boolean);
  const policyDirty = JSON.stringify(p) !== JSON.stringify(savedPolicy);

  async function savePolicy() {
    setBusy(true);
    setPolicyMsg(null);
    const r = await send("/api/admin/un/policy", "PUT", JSON.stringify(p), "application/json");
    setBusy(false);
    if (r.ok) {
      setSavedPolicy(p);
      setPolicyMsg({ ok: true, text: "Policy saved. The dashboard now uses it." });
      router.refresh();
    } else setPolicyMsg({ ok: false, text: (r.data.errors ?? [r.data.error ?? "Failed"]).join("\n") });
  }
  async function patch(id: string, body: object) {
    setBusy(true);
    setRowMsg(null);
    const r = await send(`/api/admin/un/use-cases/${id}`, "PATCH", JSON.stringify(body), "application/json");
    setBusy(false);
    if (r.ok) { setRowMsg("Updated."); router.refresh(); } else setRowMsg((r.data.errors ?? [r.data.error ?? "Failed"]).join("\n"));
  }
  const toggle = (v: Verdict) =>
    setP((x) => ({ ...x, counting_verdicts: x.counting_verdicts.includes(v) ? x.counting_verdicts.filter((c) => c !== v) : [...x.counting_verdicts, v] }));

  return (
    <div className="mt-6 space-y-14">
      <nav aria-label="On this page" className="-mx-1 flex flex-wrap gap-1 text-sm">
        {NAV.filter(([id]) => canEdit || !["policy", "import", "hitl"].includes(id)).map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line px-3 py-1 hover:border-ink-soft hover:bg-paper-deep">{label}</a>
        ))}
        <Link href="/admin/federal/scenarios" className="ml-auto rounded-full bg-ink px-3 py-1 font-medium text-paper hover:opacity-90">Run a staged scenario →</Link>
      </nav>

      <Section id="progress" eyebrow="Headline" title="Progress toward the federal target">
        <TargetProgress d={d} deadline={policy.deadline} deadlineNote={deadlineText(policy)} asOf={asOf} />
      </Section>

      <Section
        id="portfolio"
        eyebrow="Portfolio"
        title="Where the use cases stand"
        lede="Select a bar, legend item or entity to filter the use-case table below."
      >
        <div className="grid gap-x-10 gap-y-10 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-medium">Verdict mix</h3>
            <VerdictMix useCases={useCases} active={verdict} onSelect={pick(setVerdict)} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium">Lifecycle stage</h3>
            <StagePipeline byStage={d.byStage} />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium">By entity</h3>
            <p className="mb-2 flex flex-wrap gap-x-4 px-2 font-mono text-[11px] text-ink-soft">
              <span><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-lit" />deployed</span>
              <span><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-v-sup)" }} />compliant</span>
            </p>
            <TallyList rows={d.byEntity} noun="entities" active={entity} onSelect={pick(setEntity)} expanded={showAllEntities} onToggle={() => setShowAllEntities((x) => !x)} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium">By quadrant</h3>
            <TallyList rows={d.byQuadrant} noun="quadrants" expanded onToggle={() => {}} limit={4} />
          </div>
        </div>
        <h3 className="mt-10 mb-3 text-sm font-medium">Quadrant by verdict</h3>
        <QuadrantVerdictMatrix useCases={useCases} />
      </Section>

      <Section
        id="use-cases"
        eyebrow="Register"
        title={`Use cases (${filtering ? `${filtered.length} of ${useCases.length}` : useCases.length})`}
        lede={canEdit ? "Stage is editable here. Verdict comes only from a signed scenario run and compliance only from a passing Sijil attestation." : undefined}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1 text-xs">
            <span className="font-medium">Search</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, title or entity" className={field} />
          </label>
          <label className="text-xs">
            <span className="font-medium">Entity</span>
            <select value={entity} onChange={(e) => setEntity(e.target.value)} className={field}>
              <option value="">All entities</option>
              {d.byEntity.map((t) => <option key={t.key}>{t.key}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="font-medium">Verdict</span>
            <select value={verdict} onChange={(e) => setVerdict(e.target.value as VerdictFilter | "all")} className={field}>
              <option value="all">Any verdict</option>
              {VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
              <option value="NONE">Not assessed</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="font-medium">Stage</span>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className={field}>
              <option value="">Any stage</option>
              {STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          {filtering && <button type="button" onClick={clear} className="mb-1.5 text-xs font-medium underline underline-offset-2">Clear filters</button>}
        </div>
        {rowMsg && <p role="status" className="mt-3 text-sm whitespace-pre-wrap">{rowMsg}</p>}

        <div className="mt-4 relative max-h-[34rem] overflow-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">Use cases with stage, verdict and compliance</caption>
            <thead className="sticky top-0 z-10 bg-card text-left font-mono text-[11px] tracking-wide text-ink-soft uppercase shadow-[0_1px_0_var(--color-line)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">ID</th>
                <th scope="col" className="font-normal">Use case</th>
                <th scope="col" className="font-normal">Quadrant</th>
                <th scope="col" className="font-normal">Oversight</th>
                <th scope="col" className="font-normal">Stage</th>
                <th scope="col" className="font-normal">Verdict</th>
                <th scope="col" className="pr-4 text-center font-normal">Compliant</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-line align-middle hover:bg-paper-deep/50">
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{u.ext_id}</td>
                  <td className="max-w-80 py-2.5 pr-3">
                    <Link href={`/admin/federal/use-cases/${u.id}`} className="font-medium underline decoration-line underline-offset-2 hover:decoration-ink">{u.title}</Link>
                    <span className="block text-xs text-ink-soft">{u.entity}</span>
                  </td>
                  <td className="pr-3 whitespace-nowrap">{u.quadrant}</td>
                  <td className="pr-3 whitespace-nowrap text-xs text-ink-soft">{u.client_facing ? "● client-facing" : "○ internal"}</td>
                  <td className="pr-3">
                    <span className="relative inline-flex items-center rounded-md border border-line px-2 py-0.5 font-mono text-[11px] focus-within:outline-2 focus-within:outline-lit">
                      {u.stage}{canEdit && <span aria-hidden className="ml-1 text-ink-soft">▾</span>}
                      {canEdit && (
                        <select aria-label={`Stage for ${u.ext_id}`} disabled={busy} value={u.stage} onChange={(e) => patch(u.id, { stage: e.target.value })} className="absolute inset-0 w-full cursor-pointer opacity-0">
                          {STAGES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      )}
                    </span>
                  </td>
                  <td className="pr-3">
                    <VerdictBadge verdict={u.verdict} />
                  </td>
                  <td className="pr-4 text-center">
                    <span aria-label={`Compliant ${u.ext_id}: ${u.compliant ? "yes" : "no"}`} title="Set only by a passing Sijil attestation">{u.compliant ? "✓" : "–"}</span>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-soft">
                  {useCases.length ? <>No use case matches. <button type="button" onClick={clear} className="font-medium underline">Clear filters</button></> : "No use cases yet. Import a CSV below (a sample is in data/un-use-cases.csv)."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-soft">
          {VERDICTS.map((v) => <span key={v}><span aria-hidden style={{ color: VERDICT_META[v].color }}>{VERDICT_META[v].glyph}</span> {v.replace("_", " ")}: {VERDICT_META[v].hint}</span>)}
        </p>
      </Section>

      {canEdit && (
        <>
          <Section
            id="policy"
            eyebrow="Configure"
            title="Policy"
            lede="The framework has not defined what counts as deployed, so the counting rule is explicit and yours to change."
            aside={<span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase ${policyDirty ? "border-ember/60 text-ember" : "border-line text-ink-soft"}`}>{policyDirty ? "● Unsaved changes" : "Saved"}</span>}
          >
            <div className={`${card} space-y-8`}>
              <fieldset>
                <legend className="font-mono text-[11px] tracking-[0.2em] text-ink-soft uppercase">The target</legend>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Target %" hint="Share of use cases that must be deployed." error={pErr.target}>
                    <input type="number" min={0} max={100} step={1} inputMode="numeric" aria-invalid={!!pErr.target} className={field} value={Number.isNaN(p.target_percent) ? "" : p.target_percent} onChange={(e) => setP({ ...p, target_percent: e.target.value === "" ? NaN : Number(e.target.value) })} />
                  </Field>
                  <Field label="Deadline" hint="Announced April 2026 as “within two years”.">
                    <input type="date" className={field} value={p.deadline ?? ""} onChange={(e) => setP({ ...p, deadline: e.target.value || null })} />
                  </Field>
                </div>
              </fieldset>

              <fieldset>
                <legend className="font-mono text-[11px] tracking-[0.2em] text-ink-soft uppercase">What counts as deployed</legend>
                <p className="mt-2 text-sm text-ink-soft">A use case counts toward the target when its verdict is ticked here.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {VERDICTS.map((v) => {
                    const on = p.counting_verdicts.includes(v);
                    return (
                      <label key={v} title={VERDICT_META[v].hint} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-lit ${on ? "border-ink bg-paper-deep" : "border-line hover:border-ink-soft"}`}>
                        <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(v)} />
                        <span aria-hidden style={{ color: VERDICT_META[v].color }}>{VERDICT_META[v].glyph}</span>
                        <span className="font-mono text-xs">{v}</span>
                        <span aria-hidden className={`text-xs ${on ? "text-ink" : "text-transparent"}`}>✓</span>
                        <span className="sr-only">{on ? "counts as deployed" : "does not count"}</span>
                      </label>
                    );
                  })}
                </div>
                {pErr.counting && <p role="alert" className="mt-2 text-xs text-ember">✕ {pErr.counting}</p>}
              </fieldset>

              <details className="group" open>
                <summary className="w-fit cursor-pointer font-mono text-[11px] tracking-[0.2em] text-ink-soft uppercase">Name, jurisdiction and source ▾</summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Policy name" error={pErr.name}>
                    <input aria-invalid={!!pErr.name} className={field} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
                  </Field>
                  <Field label="Jurisdiction">
                    <input className={field} value={p.jurisdiction} onChange={(e) => setP({ ...p, jurisdiction: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Source URL" hint="Where the target was announced; shown to reviewers as the citation.">
                      <input type="url" className={field} value={p.source_url ?? ""} onChange={(e) => setP({ ...p, source_url: e.target.value || null })} />
                    </Field>
                  </div>
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                <button className={btnPrimary} disabled={busy || policyInvalid || !policyDirty} onClick={savePolicy}>Save policy</button>
                {policyDirty && (
                  <button type="button" className="text-sm underline underline-offset-2" onClick={() => { setP(savedPolicy); setPolicyMsg(null); }}>Discard changes</button>
                )}
                {pErr.name && <p role="alert" className="text-sm text-ember">✕ {pErr.name} (open “Name, jurisdiction and source”)</p>}
                {policyMsg && <p role="status" className={`text-sm whitespace-pre-wrap ${policyMsg.ok ? "text-lit-deep" : "text-ember"}`}>{policyMsg.ok ? "✓" : "✕"} {policyMsg.text}</p>}
              </div>
            </div>
          </Section>

          <Section id="import" eyebrow="Configure" title="Import use cases" lede="Upload the entity register as CSV. All rows are checked first; a single error blocks the import so the register is never half-updated.">
            <div className={card}>
              <ImportCsv existingIds={useCases.map((u) => u.ext_id)} />
            </div>
          </Section>

          <Section
            id="hitl"
            eyebrow="Configure"
            title="Human oversight rules by entity"
            lede="A use case that breaks a rule in force for its entity fails the human final approval gate outright; it is never averaged away. Every rule is on unless switched off."
          >
            <HitlEditor entities={d.byEntity.map((t) => t.key)} config={hitl} useCases={useCases} />
          </Section>
        </>
      )}
    </div>
  );
}
