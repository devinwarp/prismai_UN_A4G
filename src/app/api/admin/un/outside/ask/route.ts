import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { openAgent } from "@/lib/un/analyst-agent";
import { adminMemoryStore } from "@/lib/un/case-memory-store";
import { cachedOcr } from "@/lib/un/doc-ocr";
import { NO_REGISTRY, RECORDS, TODAY } from "@/lib/un/fixtures-uc02";
import { queueingRequestOutside } from "@/lib/un/outside-queue";
import { searchSop } from "@/lib/un/sop-kb";
import { createAdminClient } from "@/lib/supabase/admin";

const SOP = "SOP-LIC-014";
const PROFILE = "Document Verification Analyst";
const DEMO_CASE = "CASE-DEMO-1";

/** POST {question} → ask the licence-renewal agent about the demo case (a fictitious licence). If the SOP cannot
 * answer, the agent's required outside-information call queues a request for a person. Retrieval is the
 * offline BM25 search here; the model reasoner is used only if AGENT_REASONER=llm and an endpoint is set. */
export async function POST(req: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  const q = typeof body.question === "string" ? body.question.trim() : "";
  if (!q || q.length > 400) return bad("A question of 1 to 400 characters is required");
  const db = createAdminClient();
  const agent = await openAgent({
    sopId: SOP, profile: PROFILE, caseId: DEMO_CASE, today: TODAY, store: adminMemoryStore(who.org_id!),
    tools: {
      licenceRecord: () => RECORDS.noor, registry: () => NO_REGISTRY, payments: () => [], ocr: cachedOcr({}),
      retrieve: async (query, kind) => (await searchSop(SOP, query, { k: 5, kind })).hits,
      requestOutside: queueingRequestOutside(db, who.org_id!, { caseId: DEMO_CASE, sopId: SOP, profile: PROFILE }),
    },
  });
  await agent.openCase({ licence_number: RECORDS.noor.licence_number, declared_activity_code: "4711" });
  const r = await agent.ask(q);
  return NextResponse.json({ status: r.status, citations: r.citations, quotes: r.answer, person_answer: r.person_answer ?? null });
}
