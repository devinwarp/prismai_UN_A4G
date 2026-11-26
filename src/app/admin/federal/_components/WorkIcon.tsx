"use client";

import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "./Lang";
import type { Automation } from "@/lib/un/automation";

// One icon language for "who is doing this": a person, an agent working, an agent finished. Drawn with one stroke weight. The glyph never stands alone:
// the word beside it (or the accessible name) says the same thing. Used in the use-case register, and reusable for inbox items (a person or an agent).

const WORDS: Record<Automation, [string, string, string]> = {
  human: ["wk.human", "Human", "People do this work today. No job profile is ticked for automation."],
  agent_progress: ["wk.progress", "Agent working", "A job profile is ticked for automation. The agent is being set up and proven, and is not in production yet."],
  agent_done: ["wk.done", "Agent done", "The agent is deployed to production."],
};

function Glyph({ kind }: { kind: Automation }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "h-4 w-4 shrink-0" } as const;
  if (kind === "human") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5.2 20c.5-3.7 3.2-5.6 6.8-5.6s6.3 1.9 6.8 5.6" />
      </svg>
    );
  }
  // the agent: a squared head with two eyes and an antenna
  const head = (
    <>
      <rect x="4.5" y="8" width="15" height="11" rx="3" />
      <path d="M12 8V5.2" />
      <circle cx="12" cy="4.2" r="1" />
      <path d="M9.2 13.2h.01M14.8 13.2h.01" strokeWidth={2.4} />
    </>
  );
  if (kind === "agent_progress") {
    return (
      <svg {...common}>
        {head}
        {/* a progress arc under the head, open: still going */}
        <path d="M8 21.4a6 6 0 0 0 8 0" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      {head}
      {/* a check in the head's lower edge: finished */}
      <path d="M9.6 16.4l1.7 1.5 3.3-3.1" strokeWidth={1.6} />
    </svg>
  );
}

/** Icon and word for one state. `compact` drops the word on a very narrow layout but keeps it for screen readers and as a tooltip. */
export default function WorkIcon({ kind, compact = false }: { kind: Automation; compact?: boolean }) {
  const lang = useLang();
  const [key, en, hint] = WORDS[kind];
  const word = tr(lang, key, en);
  const tone = kind === "human" ? "text-ink-soft" : "text-lit-deep";
  return (
    <span title={tr(lang, `${key}.h`, hint)} className={`inline-flex items-center gap-1.5 whitespace-nowrap ${tone}`}>
      <Glyph kind={kind} />
      <span className={compact ? "sr-only" : "text-xs font-medium"}>{word}</span>
    </span>
  );
}
