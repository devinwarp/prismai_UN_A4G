import type { SealSummary } from "@/lib/un/pilot-run";
import { T, TV } from "./Lang";

// One line that says where a pilot's Sijil figures came from: a real node (with what the node said about its chain), or the simulated gate.
// Never claims more than the data: a fallback or an absent summary always reads "Simulated Sijil gate".
export function SealLine({ sijil }: { sijil?: SealSummary | null }) {
  const id = (sijil?.source ?? "").startsWith("node:") ? (sijil!.source.slice(5) || "node") : "";
  let line: React.ReactNode;
  let kind: string;
  if (sijil && sijil.source !== "simulated" && sijil.source !== "partial" && sijil.halted) {
    kind = "halted";
    line = <TV k="sl.halted" en="Sijil node {id} is halted: every call was sealed as blocked ({n} records)." v={{ id, n: sijil.sealed }} />;
  } else if (sijil && id) {
    kind = "node";
    line = sijil.chain_ok === true
      ? <TV k="sl.node.ok" en="Sijil node {id}: {n} records sealed across {r} runs, chain verified." v={{ id, n: sijil.sealed, r: sijil.runs_sealed }} />
      : sijil.chain_ok === false
        ? <TV k="sl.node.bad" en="Sijil node {id}: {n} records sealed across {r} runs, chain NOT verified ({why})." v={{ id, n: sijil.sealed, r: sijil.runs_sealed, why: sijil.chain_reason ?? "no reason given" }} />
        : <TV k="sl.node.unk" en="Sijil node {id}: {n} records sealed across {r} runs." v={{ id, n: sijil.sealed, r: sijil.runs_sealed }} />;
  } else if (sijil?.source === "partial") {
    kind = "partial";
    line = <TV k="sl.partial" en="Sijil node used for {k} of {r} runs; the others fell back to the simulated gate." v={{ k: sijil.runs_sealed, r: sijil.runs }} />;
  } else if (sijil?.note) {
    kind = "simulated";
    line = <TV k="sl.sim.note" en="Simulated Sijil gate: {note}" v={{ note: sijil.note }} />;
  } else if (sijil) {
    kind = "simulated";
    line = <T k="sl.sim.down" en="Simulated Sijil gate: a Sijil node was configured but unreachable, so these runs used the simulated gate." />;
  } else {
    kind = "simulated";
    line = <T k="sl.sim.none" en="Simulated Sijil gate: no Sijil node was used for this pilot; rejected calls come from Prism's own allowlist check." />;
  }
  return <p className="mt-2 text-xs text-ink-soft" data-testid="seal-line" data-seal={kind}>{line}</p>;
}
