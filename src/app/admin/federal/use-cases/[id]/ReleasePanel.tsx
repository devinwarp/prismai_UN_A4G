import Link from "next/link";
import type { Release } from "@/lib/un/release-store";
import { T, TV } from "../../_components/Lang";
import { card } from "../../_components/ui";

/** Whether the use case is ready to be approved and put into production, and if not what is missing. The same answer the approval
 * and the go-live make (they refuse with these reasons): said up front, with where to fix each. */
export function ReleasePanel({ id, release }: { id: string; release: Release }) {
  const where = (code: string) =>
    code === "no_targets" || code === "target_unmeasurable" ? `/admin/federal/use-cases/${id}/targets`
    : code === "stale_set" || code === "stale_params" || code === "params_looser" ? `/admin/federal/use-cases/${id}/tests`
    : `/admin/federal/use-cases/${id}/pilot`;
  return (
    <section className={`${card} mt-4`} aria-labelledby="rr-h" data-testid="release-panel">
      <h2 id="rr-h" className="text-lg font-semibold"><T k="rr.h" en="Is the pilot met?" /></h2>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft"><T k="rr.lede" en="Approval and go-live need a met pilot for every automated job profile: run under the approved tests and thresholds, goal judgments approved, conclusive with nothing failing, every generated case ruled on, and every control target proven. The signature then covers exactly these reports." /></p>
      {release.ok ? (
        <>
          <p className="mt-2 text-sm font-medium" role="status"><T k="rr.ok" en="Met. The pilot reports below are what an approval would cover." /></p>
          <ul className="mt-1 list-disc ps-5 font-mono text-xs text-ink-soft">{release.reports.map((r) => <li key={r.profile}>{r.profile} · report {r.report_hash.slice(0, 12)} · tests {r.test_set_hash.slice(0, 12)} · params {r.params_hash.slice(0, 12)}</li>)}</ul>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium" role="status"><TV k="rr.no" en="Not met: {n} things to fix first." v={{ n: release.blockers.length }} /></p>
          <ul className="mt-1 list-disc ps-5 text-sm">
            {release.blockers.map((b, i) => <li key={i}>{b.message} <Link className="text-xs underline" href={where(b.code)}><T k="rr.fix" en="Fix it" /></Link></li>)}
          </ul>
        </>
      )}
    </section>
  );
}
