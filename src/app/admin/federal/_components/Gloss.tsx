"use client";

import { useId } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "./Lang";

// Plain-language term first, technical term in the hint. Keys: gloss.<id>.term / .hint.
export const GLOSS = {
  logbook: { term: "tamper-proof logbook", hint: "Technical term: hash chain. Every record carries the SHA-256 fingerprint of the record before it, so changing any past record breaks every fingerprint after it." },
  gate: { term: "check", hint: "Technical term: gate. A yes/no rule a use case must satisfy before it can be cleared, for example that a person approves outputs." },
  verdict: { term: "decision", hint: "Technical term: verdict. The policy engine's answer from the evidence so far. A person still signs it." },
  oversight: { term: "human oversight", hint: "Technical term: human in the loop (HITL). A person reviews or approves what the AI does before it affects a citizen." },
  sijil: { term: "attestation", hint: "Sijil is the team's simulated attestation service: it records that a use case's evidence was reviewed. Synthetic here." },
  deployed: { term: "deployed", hint: "Counts toward the federal target: the use case has a decision your policy lets count (set under Policy)." },
  compliant: { term: "aligned", hint: "Aligned with its goals and rules. Assumed for every use case until the Sijil attestation, which will measure it, is integrated." },
  signature: { term: "sign-off", hint: "A named person approves the decision. It is written as the last record in the logbook." },
} as const;
export type GlossId = keyof typeof GLOSS;

export function Term({ id, children }: { id: GlossId; children?: string }) {
  const lang = useLang();
  const tip = useId();
  const g = GLOSS[id];
  return (
    <button type="button" className="gloss" aria-describedby={tip}>
      {children ?? tr(lang, `gloss.${id}.term`, g.term)}
      <span role="tooltip" id={tip} className="gloss-tip">{tr(lang, `gloss.${id}.hint`, g.hint)}</span>
    </button>
  );
}
