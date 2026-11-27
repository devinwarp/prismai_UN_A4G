"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { fill } from "../_components/labels";
import { useLang } from "../_components/Lang";
import { btnGhost, btnPrimary } from "../_components/ui";

export type AutomationProfile = { name: string; tasks: number; clientFacing: boolean; affectsRights: boolean; irreversible: boolean; automate: boolean; skill: boolean };
export type AutomationRow = {
  id: string; code: string; title: string; frozen: boolean;
  /** null: no SOP is attached yet. */
  kb: { ok: boolean; reason: string } | null;
  profiles: AutomationProfile[];
};

type Msg = { ok: boolean; text: string };

async function call(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(`/api/admin/un/use-cases/${id}/profiles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch { return { ok: false, status: 0, data: {} }; }
}

function Card({ row, canEdit }: { row: AutomationRow; canEdit: boolean }) {
  const lang = useLang();
  const router = useRouter();
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(row.profiles.map((p) => [p.name, p.automate])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const t = (k: string, en: string) => tr(lang, k, en);
  const changed = row.profiles.filter((p) => on[p.name] !== p.automate);
  const readOnly = !canEdit || row.frozen;

  async function save() {
    setBusy(true); setMsg(null);
    const problems: string[] = [];
    for (const p of changed) {
      const r = await call(row.id, { action: "tick", profile: p.name, automate: on[p.name] });
      if (!r.ok) { problems.push(`${p.name}: ${String(r.data.error ?? t("gt.failed", "The request failed."))}`); continue; }
      const kb = r.data.kb as { ok?: boolean; reason?: string } | null;
      if (on[p.name] && kb && kb.ok === false) problems.push(`${p.name}: ${kb.reason ?? ""}`);
      else if (on[p.name] && (r.data.skill as { ok?: boolean } | null)?.ok === false) problems.push(`${p.name}: ${String((r.data.skill as { reason?: string }).reason ?? "")}`);
    }
    setBusy(false);
    setMsg(problems.length ? { ok: false, text: problems.join(" · ") } : { ok: true, text: t("en.saved", "Saved.") });
    router.refresh();
  }

  async function build() {
    setBusy(true); setMsg(null);
    const r = await call(row.id, { action: "build_kb" });
    setBusy(false);
    const kb = r.data.kb as { ok?: boolean; reason?: string } | undefined;
    setMsg(r.ok && kb?.ok ? { ok: true, text: t("su.auto.kb.ok", "Knowledge base ready.") } : { ok: false, text: kb?.reason ?? String(r.data.error ?? t("gt.failed", "The request failed.")) });
    router.refresh();
  }

  return (
    <li className="rounded-lg border border-line p-3">
      <p className="text-sm font-medium"><bdi dir="ltr" className="font-mono text-xs">{row.code}</bdi> · {row.title}</p>
      {!row.kb ? (
        <p className="mt-1 text-sm text-ink-soft">{t("su.auto.nosop", "Attach this use case's SOP above first.")}</p>
      ) : (
        <>
          <p className="mt-1 text-sm" role="status">
            {row.kb.ok ? <span className="text-lit-deep">✓ {t("su.auto.kb.ok", "Knowledge base ready.")}</span> : <span>✕ {row.kb.reason}</span>}
          </p>
          {!row.kb.ok && !readOnly && <button type="button" className={`${btnGhost} mt-2`} disabled={busy} onClick={() => void build()}>{t("su.auto.kb.build", "Build the knowledge base")}</button>}
          {row.profiles.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">{t("su.auto.noprofiles", "No job profiles were found in this SOP.")}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {row.profiles.map((p) => {
                const flags = [p.clientFacing && t("su.auto.f.cf", "client-facing"), p.affectsRights && t("su.auto.f.rights", "affects rights"), p.irreversible && t("su.auto.f.irrev", "irreversible")].filter(Boolean).join(", ");
                return (
                  <li key={p.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="size-4 accent-[var(--color-lit)]" checked={!!on[p.name]} disabled={readOnly || busy} aria-label={`${t("su.auto.automate", "Automate")}: ${p.name}`} onChange={(e) => setOn((cur) => ({ ...cur, [p.name]: e.target.checked }))} />
                      <span className="font-medium">{p.name}</span>
                    </label>
                    <span className="text-xs text-ink-soft">{fill(t("su.auto.tasks", "{n} tasks"), { n: p.tasks })}{flags && ` · ${flags}`}{p.automate && ` · ${p.skill ? t("su.auto.skill", "skill ready") : t("su.auto.noskill", "no skill yet")}`}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {row.frozen && <p className="mt-2 text-xs text-ink-soft">{t("su.auto.frozen", "Deployed: the SOP and its job profiles are frozen.")}</p>}
          {!readOnly && row.profiles.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className={btnPrimary} disabled={busy || changed.length === 0} onClick={() => void save()}>{t("su.auto.save", "Save automation")}</button>
              <button type="button" className={btnGhost} disabled={busy} onClick={() => setOn(Object.fromEntries(row.profiles.map((p) => [p.name, true])))}>{t("su.auto.all", "Select all")}</button>
              <button type="button" className={btnGhost} disabled={busy} onClick={() => setOn(Object.fromEntries(row.profiles.map((p) => [p.name, false])))}>{t("su.auto.none", "Clear")}</button>
            </div>
          )}
        </>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
    </li>
  );
}

/** The last part of the SOP step: which job profiles of each SOP an agent will perform. A person decides (a role that approves or decides stays human);
 * each tick builds the agent's skill from the SOP, and the SOP stage is ready only once a profile is ticked and its skill and the knowledge base are in place. */
export default function AutomationConfirm({ rows, canEdit }: { rows: AutomationRow[]; canEdit: boolean }) {
  const lang = useLang();
  if (!rows.length) return null;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="text-base font-medium">{tr(lang, "su.auto.h", "Job profiles to automate")}</h3>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "su.auto.lede", "Choose which job profiles of each SOP an agent will perform. A role that approves or decides stays a person's. Each tick builds the agent's skill from the SOP.")}</p>
      <ul className="mt-3 space-y-3">{rows.map((r) => <Card key={r.id} row={r} canEdit={canEdit} />)}</ul>
    </div>
  );
}
