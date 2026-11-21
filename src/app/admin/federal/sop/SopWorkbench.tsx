"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import type { AutomationClass, FlagId, SopAnalysis } from "@/lib/un/sop/types";
import { useLang } from "../_components/Lang";
import { btnGhost, btnPrimary, field } from "../_components/ui";

interface Doc { id: string; title: string; text: string; analysis: SopAnalysis }

const CLASS_META: Record<AutomationClass, { glyph: string; k: string; en: string }> = {
  automate: { glyph: "●", k: "sop.c.automate", en: "A system can do it" },
  assist: { glyph: "◐", k: "sop.c.assist", en: "AI helps, a person checks" },
  keep_human: { glyph: "○", k: "sop.c.keep_human", en: "Stays with a person" },
};
const FLAG_META: Record<FlagId, { k: string; en: string; hintEn: string }> = {
  client_facing: { k: "sop.f.client_facing", en: "Talks to the public", hintEn: "Technical term: client facing. Anything sent to a citizen needs a person to approve it before it goes out." },
  affects_rights: { k: "sop.f.affects_rights", en: "Affects people's rights", hintEn: "Technical term: affects rights. Fees, penalties, eligibility or appeals. A person must make the final call." },
  irreversible: { k: "sop.f.irreversible", en: "Cannot be undone", hintEn: "Technical term: irreversible. Once done it cannot be reversed, so a person approves it first." },
};
const chip = "inline-flex items-center gap-1.5 rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[11px]";
const num = (n: number) => n.toLocaleString("en-US");
const MAX = 200_000;

export default function SopWorkbench({ samples, canEdit, uc02Id }: { samples: Doc[]; canEdit: boolean; uc02Id?: string | null }) {
  const lang = useLang();
  const t = (k: string, en: string) => tr(lang, k, en);
  const [doc, setDoc] = useState<Doc>(samples[0]);
  const [pick, setPick] = useState<string | null>(samples[0].id);
  const [active, setActive] = useState<string[]>([]);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const a = doc.analysis;
  const klass = useMemo(() => new Map(a.candidates.flatMap((c) => c.step_ids.map((s) => [s, c.class] as const))), [a]);
  const lit = useMemo(() => {
    const on = new Set<number>();
    for (const s of a.steps) if (active.includes(s.id)) for (let l = s.cite.start; l <= s.cite.end; l++) on.add(l);
    return on;
  }, [a, active]);
  const lines = useMemo(() => doc.text.replace(/\r/g, "").split("\n"), [doc.text]);
  const toggle = (ids: string[]) => setActive((cur) => (ids.every((i) => cur.includes(i)) ? cur.filter((i) => !ids.includes(i)) : [...new Set([...cur, ...ids])]));

  const choose = (d: Doc) => { setDoc(d); setPick(d.id); setActive([]); setMsg(null); setLink(null); };
  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const attachUc02 = async () => {
    setBusy(true); setMsg(null);
    const r = await post(`/api/admin/un/use-cases/${uc02Id}/profiles`, { action: "attach", sop_id: doc.id });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: String(r.data.error ?? "Could not attach") });
    setMsg({ ok: true, text: t("pf.sop.attached_uc02", "Attached to use case UC02") });
  };
  const body = () => (pick ? { sample: pick } : { text: doc.text, title: doc.title });

  async function analyse() {
    if (!paste.trim()) return setMsg({ ok: false, text: t("sop.empty", "Paste some text or choose a file first.") });
    if (paste.length > MAX) return setMsg({ ok: false, text: t("sop.big", "That file is over 200 KB.") });
    setBusy(true); setMsg(null); setLink(null);
    const r = await post("/api/admin/un/sop/analyze", { text: paste });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: String(r.data.error ?? "Analysis failed") });
    setDoc({ id: r.data.input.sop_id, title: r.data.input.title, text: r.data.input.text, analysis: r.data.analysis });
    setPick(null); setActive([]);
  }
  async function promote() {
    setBusy(true); setMsg(null);
    const r = await post("/api/admin/un/sop/promote", body());
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: String(r.data.error ?? "Could not promote") });
    setMsg({ ok: true, text: `${t("sop.created", "Created")} ${r.data.ext_id}.` });
    setLink(String(r.data.compare_url));
  }
  async function file(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX) return setMsg({ ok: false, text: t("sop.big", "That file is over 200 KB.") });
    setPaste(await f.text());
  }

  const flagsOn = (Object.keys(FLAG_META) as FlagId[]).filter((f) => a.flags[f]);
  const share = (c: AutomationClass) => `${Math.round(a.assumptions.share_by_class[c] * 100)}%`;

  return (
    <div className="mt-8 space-y-10">
      <section aria-labelledby="sop-in">
        <h2 id="sop-in" className="font-mono text-[11px] tracking-[0.22em] text-ink-soft uppercase">{t("sop.pick", "Choose a sample procedure")}</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {samples.map((s) => (
            <li key={s.id}>
              <button type="button" aria-pressed={pick === s.id} onClick={() => choose(s)}
                className={`rounded-full border px-4 py-2 text-sm ${pick === s.id ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper-deep"}`}>{s.title.replace(" (SOP)", "")}</button>
            </li>
          ))}
        </ul>
        {canEdit ? (
          <details className="mt-4 max-w-[68ch]">
            <summary className="w-fit cursor-pointer text-sm underline underline-offset-2">{t("sop.own", "Add your own (text or markdown)")}</summary>
            <label className="mt-3 block text-sm">
              <span className="font-medium">{t("sop.paste", "Paste the procedure")}</span>
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} className={`${field} font-mono`} placeholder={"1. The clerk checks the form.\n2. The clerk emails the applicant."} />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className={`${btnGhost} cursor-pointer`}>
                {t("sop.file", "Choose a .txt or .md file")}
                <input type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="sr-only" onChange={(e) => file(e.target.files?.[0])} />
              </label>
              <button type="button" onClick={analyse} disabled={busy} className={btnPrimary}>{t("sop.analyse", "Analyse")}</button>
            </div>
          </details>
        ) : (
          <p role="note" className="mt-3 max-w-[68ch] text-sm text-ink-soft">{t("sop.viewer", "Judge view: the samples are precomputed and read-only. Adding a procedure and promoting it need an admin.")}</p>
        )}
      </section>

      <section aria-labelledby="sop-out" aria-live="polite">
        <h2 id="sop-out" className="font-display text-2xl font-medium tracking-tight">{doc.title}</h2>
        <p className="mt-1 text-xs text-ink-soft">{t("sop.synthetic", "Every figure uses a fictional baseline and the made-up currency XXD. Synthetic data.")}</p>

        <dl className="mt-5 grid gap-6 border-y border-line py-5 sm:grid-cols-3">
          {[
            { v: num(a.totals.hours_saved_per_year), l: t("sop.hours", "hours a year could be saved"), s: `${t("sop.of", "of")} ${num(a.totals.baseline_hours_per_year)} h (${a.totals.vs_baseline_pct}%)` },
            { v: `${num(a.totals.cost_saved_per_year)} XXD`, l: t("sop.cost", "a year in staff time"), s: t("sop.cost.h", "Hours saved times the made-up hourly rate") },
            { v: `${Math.round(a.confidence * 100)}%`, l: t("sop.conf", "confidence in the reading"), s: `${a.steps.length} ${t("sop.stepsn", "steps found")}` },
          ].map((x) => (
            <div key={x.l}>
              <dd className="font-display text-4xl leading-none tabular-nums">{x.v}</dd>
              <dt className="mt-2 text-sm font-medium">{x.l}</dt>
              <dd className="mt-0.5 text-xs text-ink-soft">{x.s}</dd>
            </div>
          ))}
        </dl>
        <details className="mt-2 text-xs text-ink-soft">
          <summary className="w-fit cursor-pointer underline underline-offset-2">{t("sop.how", "How the numbers are worked out")}</summary>
          <p className="mt-2 max-w-[68ch]" title="Technical term: synthetic baseline">
            {num(a.totals.cases_per_year)} {t("sop.how.1", "cases a year, times minutes per step (from the text, else a made-up default), times the share a step type could save")}
            {" "}({(["automate", "assist"] as const).map((c) => `${t(CLASS_META[c].k, CLASS_META[c].en)}: ${share(c)}`).join("; ")}), {t("sop.how.2", "times the made-up hourly rate.")}
          </p>
        </details>

        <h3 className="font-mono mt-8 text-[11px] tracking-[0.22em] text-ink-soft uppercase">{t("sop.flags", "Risks to check")}</h3>
        {flagsOn.length === 0 ? (
          <p className="mt-2 text-sm">{t("sop.noflags", "No risk found in the text. A person should still read it.")}</p>
        ) : (
          <ul className="mt-2 grid gap-3 sm:grid-cols-3">
            {flagsOn.map((f) => (
              <li key={f} className="text-sm">
                <span className={chip} title={FLAG_META[f].hintEn}><span aria-hidden>▲</span>{t(FLAG_META[f].k, FLAG_META[f].en)}</span>
                <p className="mt-1 text-xs text-ink-soft">{t(`${FLAG_META[f].k}.h`, FLAG_META[f].hintEn.replace(/^Technical term: [^.]*\. /, ""))}</p>
                <button type="button" className="mt-1 text-xs underline underline-offset-2" onClick={() => setActive(a.steps.filter((s) => a.flags.evidence[f].some((e) => e.start === s.cite.start && e.end === s.cite.end)).map((s) => s.id))}>
                  {t("sop.where", "Show the lines")} ({a.flags.evidence[f].map((e) => e.start).join(", ")})
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <h3 className="font-mono text-[11px] tracking-[0.22em] text-ink-soft uppercase">{t("sop.steps", "Steps found")}</h3>
            <ol className="mt-2 divide-y divide-line border-y border-line">
              {a.steps.map((s) => {
                const c = klass.get(s.id);
                const on = active.includes(s.id);
                return (
                  <li key={s.id}>
                    <button type="button" aria-pressed={on} onClick={() => toggle([s.id])} className={`w-full px-2 py-2.5 text-start text-sm hover:bg-paper-deep ${on ? "bg-lit-soft" : ""}`}>
                      <span className="font-mono text-[11px] text-ink-soft">{s.id} · {t("sop.line", "line")} {s.cite.start}{s.cite.end > s.cite.start ? `-${s.cite.end}` : ""}{c ? ` · ${CLASS_META[c].glyph} ${t(CLASS_META[c].k, CLASS_META[c].en)}` : ""}</span>
                      <span className="mt-0.5 block">{s.text}</span>
                      {(s.actor || s.systems.length > 0) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {s.actor && <span className={chip} title="Technical term: actor">{s.actor}</span>}
                          {s.systems.map((x) => <span key={x} className={chip} title="Technical term: system">{x}</span>)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="lg:sticky lg:top-4 lg:self-start">
            <h3 className="font-mono text-[11px] tracking-[0.22em] text-ink-soft uppercase">{t("sop.source", "Source text")}</h3>
            <div dir="ltr" role="textbox" aria-readonly="true" aria-multiline="true" tabIndex={0} aria-label={t("sop.source", "Source text")} className="mt-2 max-h-[34rem] overflow-auto rounded-xl border border-line bg-card py-2 font-mono text-[12.5px] leading-6 whitespace-pre-wrap">
              {lines.map((l, i) => (
                <span key={i} className={`flex gap-3 px-3 ${lit.has(i + 1) ? "bg-lit-soft text-ink" : "text-ink-soft"}`}>
                  <span aria-hidden className="w-8 shrink-0 text-end tabular-nums select-none">{lit.has(i + 1) ? "▸" : ""}{i + 1}</span>
                  <span className="min-w-0 break-words">{l || " "}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <h3 className="font-mono mt-8 text-[11px] tracking-[0.22em] text-ink-soft uppercase">{t("sop.cands", "What could change, and why")}</h3>
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {a.candidates.map((c) => (
            <li key={c.class} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <p className="text-base font-medium"><span aria-hidden>{CLASS_META[c.class].glyph} </span>{t(CLASS_META[c.class].k, CLASS_META[c.class].en)} <span className="font-mono text-xs text-ink-soft">({c.step_ids.join(", ")})</span></p>
                <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{c.reason}</p>
                <button type="button" className="mt-1 text-xs underline underline-offset-2" onClick={() => toggle(c.step_ids)}>{t("sop.where", "Show the lines")}</button>
              </div>
              <p className="text-sm tabular-nums sm:text-end">
                <span className="font-display text-2xl">{num(c.hours_saved_per_year)}</span> h<br />
                <span className="text-ink-soft">{num(c.cost_saved_per_year)} XXD</span>
              </p>
            </li>
          ))}
        </ul>
        {a.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-ink-soft">
            {a.warnings.map((w) => <li key={w}><span aria-hidden>◇ </span>{w}</li>)}
          </ul>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-4">
          {canEdit ? (
            <button type="button" onClick={promote} disabled={busy || a.steps.length === 0} className={btnPrimary}>{t("sop.promote", "Promote to governed use case")}</button>
          ) : (
            <p className="text-sm text-ink-soft">{t("sop.promote.admin", "Promoting to a governed use case needs an admin.")}</p>
          )}
          {uc02Id && doc.id === "SOP-LIC-014" && (
            <>
              {canEdit && <button type="button" onClick={attachUc02} disabled={busy} className={btnGhost}>{t("pf.sop.attach_uc02", "Attach to use case UC02")}</button>}
              <Link href={`/admin/federal/use-cases/${uc02Id}/sop`} className="text-sm font-medium underline underline-offset-4">{t("pf.sop.open_uc02", "Open the job profiles in UC02")} <span aria-hidden className="inline-block rtl:rotate-180">→</span></Link>
            </>
          )}
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "" : "text-ember"}`}>{msg.ok ? "✓ " : "✕ "}{msg.text}</p>}
          {link && <Link href={link} className="text-sm font-medium underline underline-offset-4">{t("sop.compare", "See the decision on the compare page")} <span aria-hidden className="inline-block rtl:rotate-180">→</span></Link>}
        </div>
      </section>
    </div>
  );
}
