"use client";

import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "./Lang";
import type { Automation } from "@/lib/un/automation";

// One icon language for "who is doing this", read at a glance without the word: a PERSON (outline), an AGENT that is only identified or being set up
// (the robot drawn as a dashed outline, with a clock), and an AGENT that is deployed (the robot solid, with a check). The three differ in shape, fill and
// colour, so they stay apart at table size and for people who cannot tell the colours apart. The glyph never stands alone: the word beside it (or the
// accessible name) says the same thing. Used in the use-case register and for inbox items (a person or an agent).

const WORDS: Record<Automation, [string, string, string]> = {
  human: ["wk.human", "Human", "People do this work today. No job profile is ticked for automation."],
  agent_progress: ["wk.progress", "Agent in progress", "Identified for automation. A job profile is ticked and the agent is being set up and proven: it is not deployed yet."],
  agent_done: ["wk.done", "Agent deployed", "Identified for automation and deployed: the agent runs in production."],
};

function Glyph({ kind }: { kind: Automation }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "h-6 w-6 shrink-0" } as const;
  if (kind === "human") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5 20.5c.5-4 3.3-6 7-6s6.5 2 7 6" />
      </svg>
    );
  }
  if (kind === "agent_progress") {
    return (
      <svg {...common}>
        {/* the robot, outlined with a dashed line: not finished */}
        <rect x="3.5" y="8" width="14" height="10.5" rx="3" strokeDasharray="2.6 2.4" />
        <path d="M10.5 8V5.4" />
        <circle cx="10.5" cy="4.4" r="1" />
        <path d="M7.8 13h.01M13.2 13h.01" strokeWidth={2.4} />
        {/* a clock, bottom right: on its way */}
        <circle cx="18" cy="18" r="4.4" fill="var(--color-paper)" />
        <path d="M18 15.6V18l1.6 1" strokeWidth={1.5} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      {/* the robot, solid: it is there */}
      <rect x="3.5" y="8" width="14" height="10.5" rx="3" fill="currentColor" />
      <path d="M10.5 8V5.4" />
      <circle cx="10.5" cy="4.4" r="1" fill="currentColor" />
      <path d="M7.8 13h.01M13.2 13h.01" stroke="var(--color-paper)" strokeWidth={2.4} />
      {/* a check in a disc, bottom right: done */}
      <circle cx="18" cy="18" r="4.6" fill="currentColor" stroke="var(--color-paper)" strokeWidth={1.4} />
      <path d="M15.9 18.1l1.5 1.4 2.8-2.9" stroke="var(--color-paper)" strokeWidth={1.5} />
    </svg>
  );
}

/** Icon and word for one state. `compact` drops the word on a very narrow layout but keeps it for screen readers and as a tooltip. */
export default function WorkIcon({ kind, compact = false }: { kind: Automation; compact?: boolean }) {
  const lang = useLang();
  const [key, en, hint] = WORDS[kind];
  const word = tr(lang, key, en);
  // Prism's rules: pine is the one accent, ember means a gap or a failure (so it is not used for "on its way"), and a colour never carries a meaning alone.
  // So the shapes do the work (outline person, dashed robot with a clock, solid robot with a check); the tone only adds: ink, muted ink, pine.
  const tone = kind === "human" ? "text-ink" : kind === "agent_progress" ? "text-ink-soft" : "text-lit-deep";
  return (
    <span title={tr(lang, `${key}.h`, hint)} className={`inline-flex items-center gap-2 whitespace-nowrap ${tone}`}>
      <Glyph kind={kind} />
      <span className={compact ? "sr-only" : "text-xs font-medium"}>{word}</span>
    </span>
  );
}
