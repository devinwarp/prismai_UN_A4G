"use client";

import { tr } from "@/lib/un/i18n/dict";
import type { AgentInfo } from "@/lib/un/pilot-run";
import { useLang } from "../../../_components/Lang";

/** What drove the agent in a pilot, so a report can say what was tested: the code-based reasoner, or a model (with how many
 * reasoning calls, how often it fell back to the rule step, how many fee notices it wrote and how many needed a second try, and how
 * many answers a second look refused). A sample run is marked: it is never conclusive. */
export function AgentLine({ agent }: { agent: AgentInfo }) {
  const lang = useLang();
  return (
    <p className="mt-1 text-xs text-ink-soft" data-testid="pi-agent">
      {agent.reasoner === "llm" ? (
        <>
          {tr(lang, "pi.agent.ran.llm", "Model-driven agent")}: <span className="font-mono" dir="ltr">{agent.model}</span>
          {agent.usage && ` · ${agent.usage.calls} ${tr(lang, "pi.agent.calls", "reasoning calls")}, ${agent.usage.fallbacks} ${tr(lang, "pi.agent.fallbacks", "fell back to the rule step")}`}
          {agent.drafter && ` · ${agent.drafter.calls} ${tr(lang, "pi.agent.drafts", "model calls writing notices")} (${agent.drafter.first_pass_ok} ${tr(lang, "pi.agent.firstpass", "notices right first time")}, ${agent.drafter.revised} ${tr(lang, "pi.agent.revised", "revised")}, ${agent.drafter.unresolved} ${tr(lang, "pi.agent.unresolved", "still wrong")})`}
          {agent.reflection && ` · ${agent.reflection.calls} ${tr(lang, "pi.agent.reflections", "reflections")}, ${agent.reflection.said_no} ${tr(lang, "pi.agent.saidno", "refused an answer")}`}
        </>
      ) : tr(lang, "pi.agent.ran.rule", "Code-based reasoner (no model calls)")}
      {agent.sample && <> · <strong>{tr(lang, "pi.agent.sample", "a sample run: never conclusive")}</strong></>}
    </p>
  );
}
