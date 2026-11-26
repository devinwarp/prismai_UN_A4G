"use client";

import { useState } from "react";
import type { DemoSide } from "@/lib/un/sijil-demo-shared";
import { DEMO_NOTE } from "@/lib/un/sijil-demo-shared";
import { btnPrimary } from "../_components/ui";
import { useT } from "./useTuning";

interface DemoResult { sop: string; profile: string; v1: DemoSide; v2: DemoSide }

function Side({ side, okLabel }: { side: DemoSide; okLabel: string }) {
  const { tv } = useT();
  const rules = Object.keys(side.inference.by_rule);
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-sm font-medium">{side.label}</p>
      <p className="mt-2 text-sm tabular-nums">
        {tv("tn.demo.line", "{runs} run(s), {blocked} ended blocked_by_sijil", { runs: side.runs, blocked: side.blocked_runs })}
      </p>
      <p className="mt-1 text-sm tabular-nums">
        {tv("tn.demo.split", "{total} block(s): {attacks} attack(s) stopped, {alignment} alignment block(s)", {
          total: side.inference.total, attacks: side.inference.attacks_stopped, alignment: side.inference.alignment,
        })}
        {rules.length ? ` · ${rules.join(", ")}` : ""}
      </p>
      <p className="mt-1 text-sm font-medium">{side.allowed ? okLabel : tv("tn.demo.notallowed", "Inference not allowed (alignment blocks)", {})}</p>
      {side.seqs.length > 0 && <p className="mt-1 font-mono text-xs text-ink-soft" dir="ltr">seq {side.seqs.join(", ")}</p>}
    </div>
  );
}

/** The labelled demonstration section on the tuning page: run two draft prompt versions through a small real
 * pilot sample with every model call screened by the Sijil node. */
export default function SijilDemo({ canRun }: { canRun: boolean }) {
  const { t, tv } = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/un/sijil-demo", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setResult(j as DemoResult);
    } catch (e) { setError(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  };

  return (
    <section aria-labelledby="h-sijil-demo" className="mt-12 rounded-2xl border border-line bg-card p-5">
      <h2 id="h-sijil-demo" className="font-display text-xl font-medium">{t("tn.demo.title", "Sijil pre-inference screening — labelled demonstration")}</h2>
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">{t("tn.demo.lede", "Two draft prompt versions run through a small real pilot sample. Every model call is screened by the Sijil node before inference; a refused prompt ends its run as blocked_by_sijil with the node's record number.")}</p>
      <p className="mt-2 max-w-[68ch] text-xs text-ink-soft">{DEMO_NOTE}</p>
      <div className="mt-3">
        <button type="button" className={btnPrimary} disabled={!canRun || busy} onClick={run}>
          {busy ? t("tn.demo.running", "Running the demonstration…") : t("tn.demo.run", "Run the demonstration")}
        </button>
        {!canRun && <span className="ms-3 text-xs text-ink-soft">{t("tn.demo.need", "Needs the pilot run permission and AGENT_LLM_BASE_URL configured.")}</span>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
      {result && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Side side={result.v1} okLabel={t("tn.demo.allowed", "Inference allowed")} />
          <Side side={result.v2} okLabel={t("tn.demo.allowed", "Inference allowed")} />
        </div>
      )}
      {result && <p className="mt-3 text-xs text-ink-soft">{tv("tn.demo.sample", "Sample: {sop}, {profile}, blueprints {ids}", { sop: result.sop, profile: result.profile, ids: result.v1.sample.join(", ") })}</p>}
    </section>
  );
}
