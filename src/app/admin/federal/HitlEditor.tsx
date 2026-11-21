"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HITL_RULES, HITL_RULE_IDS, type HitlConfig, type HitlRuleId } from "@/lib/un/hitl";
import type { UnUseCaseState } from "@/lib/un/model";
import { btnPrimary } from "./_components/ui";
import { useLang } from "./_components/Lang";
import { tr } from "@/lib/un/i18n/dict";
import { fill } from "./_components/labels";

const WHEN: Record<HitlRuleId, [string, string]> = {
  client_facing_final_approval: ["ua.hitl.when.cf", "Applies to use cases flagged client-facing."],
  rights_or_fees_human_decision: ["ua.hitl.when.rf", "Applies to use cases flagged as affecting rights or fees."],
  irreversible_human_approval: ["ua.hitl.when.ir", "Applies to use cases flagged as irreversible."],
};
// Rule labels come from the engine (English); Arabic names here, keyed by rule id.
const RULE_KEY = (r: HitlRuleId) => `ua.hitl.rule.${r}`;

const key = (xs: HitlRuleId[] = []) => [...xs].sort().join("|");

/** One card per entity. A switch that is on means the rule is in force. Saved per entity. */
export default function HitlEditor({ entities, config, useCases }: { entities: string[]; config: HitlConfig; useCases: UnUseCaseState[] }) {
  const router = useRouter();
  const lang = useLang();
  const [saved, setSaved] = useState<HitlConfig>(config);
  const [off, setOff] = useState<HitlConfig>(config);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = (e: string, r: HitlRuleId) => {
    setMsg((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== e)));
    setOff((x) => ({ ...x, [e]: (x[e] ?? []).includes(r) ? (x[e] ?? []).filter((v) => v !== r) : [...(x[e] ?? []), r] }));
  };

  async function save(entity: string) {
    setBusy(entity);
    const res = await fetch("/api/admin/un/hitl", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, off: off[entity] ?? [] }),
    });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    setMsg((m) => ({ ...m, [entity]: { ok: res.ok, text: res.ok ? fill(tr(lang, "ua.hitl.savedfor", "Saved rules for {e}."), { e: entity }) : (d.error ?? tr(lang, "ua.failed", "Failed")) } }));
    if (res.ok) {
      setSaved((s) => ({ ...s, [entity]: off[entity] ?? [] }));
      router.refresh();
    }
  }

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2">
        {entities.map((e) => {
          const dirty = key(off[e]) !== key(saved[e]);
          const on = HITL_RULE_IDS.filter((r) => !(off[e] ?? []).includes(r)).length;
          const mine = useCases.filter((u) => u.entity === e);
          const m = msg[e];
          return (
            <fieldset key={e} className="rounded-2xl border border-line bg-card p-5">
              <legend className="sr-only">{e}</legend>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{e}</h3>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-soft">{fill(tr(lang, "ua.hitl.count", "{a} of {b} rules in force · {c} use cases"), { a: on, b: HITL_RULE_IDS.length, c: mine.length })}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase ${dirty ? "border-ember/60 text-ember" : "border-line text-ink-soft"}`}>
                  {dirty ? `● ${tr(lang, "ua.hitl.unsaved", "Unsaved")}` : tr(lang, "ua.pol.saved", "Saved")}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {HITL_RULE_IDS.map((r) => {
                  const isOn = !(off[e] ?? []).includes(r);
                  const n = mine.filter((u) => HITL_RULES[r].applies(u)).length;
                  const id = `${e}-${r}`.replace(/\W+/g, "-");
                  return (
                    <li key={r}>
                      <label className="flex cursor-pointer items-start gap-3 py-3">
                        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={isOn} onChange={() => toggle(e, r)} aria-describedby={`${id}-d`} />
                        <span aria-hidden className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full border border-line bg-paper-deep transition-colors peer-checked:border-lit peer-checked:bg-lit peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lit after:absolute after:top-0.5 after:start-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-card after:shadow-sm after:transition-transform peer-checked:after:translate-x-4 rtl:peer-checked:after:-translate-x-4 motion-reduce:transition-none motion-reduce:after:transition-none" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">{tr(lang, RULE_KEY(r), HITL_RULES[r].label)}</span>
                          <span id={`${id}-d`} className="mt-0.5 block text-xs text-ink-soft">{tr(lang, WHEN[r][0], WHEN[r][1])} {fill(tr(lang, "ua.hitl.here", "{n} here."), { n })} {isOn ? tr(lang, "ua.hitl.inforce", "In force.") : tr(lang, "ua.hitl.switched", "Switched off: breaches are not enforced.")}</span>
                        </span>
                        <span className="mt-0.5 shrink-0 font-mono text-[10px] tracking-wide text-ink-soft uppercase">{isOn ? tr(lang, "ua.on", "On") : tr(lang, "ua.off", "Off")}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button className={btnPrimary} disabled={busy === e || !dirty} onClick={() => save(e)}>{busy === e ? tr(lang, "ua.saving", "Saving…") : tr(lang, "ua.save", "Save")}</button>
                {m && <p role="status" className={`text-xs ${m.ok ? "text-lit-deep" : "text-ember"}`}>{m.ok ? "✓" : "✕"} {m.text}</p>}
                {!m && dirty && <p className="text-xs text-ink-soft">{fill(tr(lang, "ua.hitl.only", "Changes apply to {e} only."), { e })}</p>}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
