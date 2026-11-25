import { NextResponse } from "next/server";
import { bad, caller, requirePermission } from "@/lib/api-auth";
import { agentLlmEndpoint } from "@/lib/un/agent-llm";
import { DEMO_MODEL, runScreenDemo } from "@/lib/un/sijil-screen-demo";
import { loadUnUseCases } from "@/lib/un/store";

/** A demonstration pilot makes real model calls through the node; allow a long hosted request. */
export const maxDuration = 300;

/** POST → run the labelled Sijil screening demonstration: two draft prompt versions through a small real
 * pilot sample, every model call screened by the node at AGENT_LLM_BASE_URL. Needs pilot.run and the
 * screening configuration; 409 explains what is missing. */
export async function POST() {
  // the demonstration runs the UC02 pilot, so pilot.run is scoped to that use case
  const c = await caller();
  const uc02 = c?.org_id ? (await loadUnUseCases(c.org_id)).find((u) => u.ext_id === "UC02")?.id : undefined;
  if (!uc02) return NextResponse.json({ error: "use case UC02 is not set up in this organisation" }, { status: 409 });
  const who = await requirePermission("pilot.run", { useCaseId: uc02 });
  if (who instanceof NextResponse) return who;
  let ep = null;
  try { ep = agentLlmEndpoint(); } catch (e) { return bad(e instanceof Error ? e.message : "invalid AGENT_LLM_BASE_URL"); }
  if (!ep) return NextResponse.json({ error: "Pre-inference screening is not configured: set AGENT_LLM_BASE_URL (the Sijil node's /v1 URL) and AGENT_LLM_API_KEY" }, { status: 409 });
  if ((process.env.AGENT_LLM_MODEL ?? "") !== DEMO_MODEL) {
    return NextResponse.json({ error: `The demonstration needs AGENT_LLM_MODEL=${DEMO_MODEL} — the only model the node's allowlist accepts` }, { status: 409 });
  }
  try {
    const demo = await runScreenDemo();
    return NextResponse.json({ ok: true, ...demo });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 300) : "the demonstration failed" }, { status: 500 });
  }
}
