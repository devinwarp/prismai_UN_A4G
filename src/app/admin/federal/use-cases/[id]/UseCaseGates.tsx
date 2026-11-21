import Link from "next/link";
import type { Approver } from "@/lib/un/approvers";
import { evidenceFor, metricEvidence, type Effective } from "@/lib/un/gates";
import type { GateStatus } from "@/lib/un/policy";
import { T, TV } from "../../_components/Lang";
import { GateChip, scrollRegion, Section } from "../../_components/ui";
import { GateActions } from "./GateActions";

const chip = "inline-flex items-center rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[11px]";

/** The effective gates of one use case: what applies, why, the evidence so far, and the governance actions. */
export default function UseCaseGates({ useCaseId, ext, eff, runGates, canEdit, approvers }: {
  useCaseId: string; ext: string; eff: Effective; runGates: Partial<Record<string, GateStatus>>; canEdit: boolean; approvers: Approver[];
}) {
  const ev = evidenceFor(eff, ext, runGates);
  const candidates = Object.entries(eff.catalog).filter(([id]) => !eff.gates.some((g) => g.id === id)).map(([id, d]) => ({ id, label: d.label }));
  return (
    <Section id="gates" eyebrow={<T k="gt.s.gates" en="Gates" />} title={<T k="gt.uc.title" en="Gates for this use case" />}
      lede={<T k="gt.uc.lede" en="The rule set's gates plus any this use case has taken on, as they stand now. The verdict is worked out under exactly this list and the list is recorded on the trace. A use case can add gates but not drop one; a waiver needs a named approver and is logged." />}>
      <p className="mb-3 text-sm">
        <TV k="gt.uc.count" en="{n} gates apply, {m} added beyond the rule set." v={{ n: eff.gates.length, m: eff.added.length }} />{" "}
        <Link href="/admin/federal/gates" className="underline"><T k="gt.uc.catalogue" en="Gate catalogue and log" /></Link>
      </p>
      <div {...scrollRegion("gt-uc-cap")} className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[44rem] text-sm">
          <caption id="gt-uc-cap" className="sr-only"><T k="gt.uc.cap" en="Effective gates with the reason each applies and the evidence so far" /></caption>
          <thead className="text-start font-mono text-[11px] tracking-wide text-ink-soft uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 text-start font-normal"><T k="gt.col.gate" en="Gate" /></th>
              <th scope="col" className="text-start font-normal"><T k="gt.uc.why" en="Why it applies" /></th>
              <th scope="col" className="pe-4 text-start font-normal"><T k="gt.uc.evidence" en="Evidence" /></th>
            </tr>
          </thead>
          <tbody>
            {eff.gates.map((g) => {
              const m = metricEvidence(g.id, ext, eff.catalog[g.id]);
              return (
                <tr key={g.id} className="border-t border-line align-top">
                  <th scope="row" className="px-4 py-2.5 text-start font-normal">
                    <span className="block font-medium"><T k={`gate.${g.id}`} en={g.label} /></span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      <span className={chip}><T k={`gt.cat.${g.category}`} en={g.category} /></span>
                      {g.source === "use_case" && <span className={chip}>+ <T k="gt.uc.own" en="this use case" /></span>}
                    </span>
                  </th>
                  <td className="pe-3 py-2.5 text-xs text-ink-soft">
                    {g.reason}
                    {g.source === "use_case" && <span className="mt-1 block text-ink">{g.addedApprover ? <TV k="gt.uc.approvedby" en="Added with approval from {who}" v={{ who: g.addedApprover }} /> : <T k="gt.uc.approvedby.none" en="Added with no approver recorded (before approvers were required)" />}</span>}
                    {g.waiver && <span className="mt-1 block text-ink"><TV k="gt.uc.waived" en="Waived. Approved by {who}: {why}" v={{ who: g.waiver.approver, why: g.waiver.reason }} /></span>}
                  </td>
                  <td className="pe-4 py-2.5">
                    {g.waiver ? <span className={chip}><T k="gt.uc.waivedchip" en="waived" /></span> : <GateChip gate={g.id} status={ev[g.id] ?? "unknown"} />}
                    {m && !g.waiver && <span className="mt-1 block text-xs text-ink-soft"><TV k="gt.uc.metric" en="{v} {u} measured against {op} {t} (simulated value)" v={{ v: m.value, u: eff.catalog[g.id].metric!.unit, op: eff.catalog[g.id].metric!.op, t: eff.catalog[g.id].metric!.threshold }} /></span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <GateActions useCaseId={useCaseId} candidates={candidates} waivable={eff.gates.filter((g) => !g.waiver).map((g) => ({ id: g.id, label: g.label }))} approvers={approvers} />
      ) : (
        <p className="mt-3 text-sm text-ink-soft"><T k="gt.viewer" en="Adding and changing gates needs an administrator. Viewers and judges can read everything here." /></p>
      )}
    </Section>
  );
}
