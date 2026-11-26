"use client";

import { useEffect, useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import WorkIcon from "../_components/WorkIcon";
import { btnGhost, field } from "../_components/ui";

/**
 * A person's agent: switched on or off, and its daily limit. An administrator sets anyone's (the route enforces it); this component is shown only to them.
 * Off means everything in that person's inbox is theirs to do. An agent never takes a decision, whatever is set here.
 */
export function AgentSwitch({ userId, name }: { userId: string; name: string }) {
  const lang = useLang();
  const [s, setS] = useState<{ enabled: boolean; daily_cap: number } | null>(null);
  const [cap, setCap] = useState("50");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/un/agent?user=${encodeURIComponent(userId)}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (live && d?.settings) { setS(d.settings); setCap(String(d.settings.daily_cap)); }
    }).catch(() => {});
    return () => { live = false; };
  }, [userId]);

  async function save(patch: { enabled?: boolean; daily_cap?: number }) {
    setError(null);
    const res = await fetch("/api/admin/un/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: userId, ...patch }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? tr(lang, "gt.failed", "The request failed.")); return; }
    setS(d.settings); setCap(String(d.settings.daily_cap));
  }

  if (!s) return null;
  return (
    <section aria-labelledby={`pe-agent-${userId}`} className="mt-5 border-t border-line pt-4">
      <h2 id={`pe-agent-${userId}`} className="font-display flex items-center gap-2 text-xl font-medium"><WorkIcon kind={s.enabled ? "agent_progress" : "human"} compact />{tr(lang, "pe.agent", "Agent")}</h2>
      <p className="mt-1 text-sm text-ink-soft">{(s.enabled ? tr(lang, "pe.agent.on", "{n}'s agent works their inbox, within their permissions.") : tr(lang, "pe.agent.off", "{n}'s agent is off: everything in their inbox is theirs to do.")).replace("{n}", name)}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <button type="button" role="switch" aria-checked={s.enabled} className={btnGhost} onClick={() => void save({ enabled: !s.enabled })}>{s.enabled ? tr(lang, "pe.agent.switchoff", "Switch off") : tr(lang, "pe.agent.switchon", "Switch on")}</button>
        <label className="text-xs font-medium" htmlFor={`pe-cap-${userId}`}>{tr(lang, "pe.agent.cap", "Daily limit on its actions")}
          <input id={`pe-cap-${userId}`} inputMode="numeric" className={`${field} mt-1 w-24`} value={cap} onChange={(e) => setCap(e.target.value)} />
        </label>
        <button type="button" className={btnGhost} onClick={() => void save({ daily_cap: Number(cap) })}>{tr(lang, "ib.agent.save", "Save")}</button>
      </div>
      <p className="mt-2 text-xs text-ink-soft">{tr(lang, "ib.agent.never", "An agent never takes a decision: no approval, no signature, no deployment, no account.")}</p>
      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}
    </section>
  );
}
