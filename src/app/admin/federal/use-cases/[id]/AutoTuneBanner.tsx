import Link from "next/link";
import { noticeOf, replayAuto } from "@/lib/un/auto-tune";
import { loadAutoLog } from "@/lib/un/autotune-store";
import { T, TV } from "../../_components/Lang";

/** The notice every stakeholder sees on every page of the use case while the tuning agent is tuning the agent, or may do so by itself. It
 * says what is happening, below what limit the agent may change itself, and where the owner switches it off. Shows nothing when auto-tuning
 * has never been used. A log that cannot be read shows nothing rather than a wrong message. */
export async function AutoTuneBanner({ orgId, id }: { orgId: string; id: string }) {
  let state;
  try { state = replayAuto(await loadAutoLog(orgId, id)); } catch { return null; }
  const n = noticeOf(state);
  if (n.level === "off" && state.cycles.length === 0 && !state.switched_at) return null;
  const pct = Math.round(n.threshold * 100);
  const last = n.last;
  return (
    <div role="status" aria-live="polite" data-testid="autotune-banner" className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
      <div className={`rounded-xl border px-4 py-3 text-sm ${n.level === "running" ? "border-ink font-medium" : "border-line"}`}>
        <p>
          <strong>
            {n.level === "running" ? <T k="atb.running" en="The agent is tuning itself now." /> : n.level === "on" ? <T k="atb.on" en="Auto-tuning is on." /> : n.level === "stalled" ? <T k="atb.stalled" en="Auto-tuning is on, but it has stopped finding safe fixes." /> : <T k="atb.off" en="Auto-tuning is off." />}
          </strong>{" "}
          {n.level === "off"
            ? <T k="atb.off.b" en="Every change to the agent waits for a person." />
            : <TV k="atb.b" en="While held-out alignment is below {pct}%, the agent may apply low-risk fixes by itself (a glossary term, a retrieval route). Anything touching a control or what a citizen reads, and everything at or above {pct}%, waits for a person. Each change is logged and can be undone." v={{ pct }} />}
          {n.level === "stalled" && <> <T k="atb.stalled.b" en="Several cycles in a row changed nothing: the process owner may want to review it." /></>}
          {" "}<Link className="underline" href={`/admin/federal/use-cases/${id}/improve`}><T k="atb.link" en="Improve the agent" /></Link>
        </p>
        {last && n.level !== "running" && (
          <p className="mt-1 text-xs text-ink-soft"><TV k="atb.last" en="Last cycle {at}: {applied} applied, {proposed} waiting for a person, {discarded} discarded." v={{ at: new Date(last.at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }), applied: last.applied.length, proposed: last.proposed.length, discarded: last.discarded.length }} /></p>
        )}
      </div>
    </div>
  );
}
