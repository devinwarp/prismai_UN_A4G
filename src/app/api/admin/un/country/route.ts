import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { addPolicy, onboardCompany, recordRun, resetDemo, switchCountry, type Fail } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import type { Timing } from "@/lib/un/country";

/** POST { action: "switch", country, company? } | { action: "add_policy", country } | { action: "onboard", name?, country?, sample? | sop_text?, title? }
 * | { action: "run", company, country } | { action: "reset" }, optionally with `stream: true` (add_policy and onboard then answer with
 * newline-delimited JSON: one {stage} line per finished stage with its real count and time, then {done}). Admin only: viewers and judges
 * get 403 and can only read the stored result on the page. Every action is written to the hash-chained country log. */
export async function POST(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return bad("Invalid JSON");
  const d = appCountryDeps(who.org_id!);
  const actor = who.email ?? who.id;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  const go = (onStage?: (t: Timing) => void) => {
    switch (b.action) {
      case "switch": return switchCountry(d, actor, str("country"), str("company") || "marsa");
      case "add_policy": return addPolicy(d, actor, str("country"), onStage);
      case "onboard": return onboardCompany(d, actor, b, onStage);
      case "run": return recordRun(d, actor, str("company") || "marsa", str("country"));
      case "reset": return resetDemo(d, actor, who.org_id!);
      default: return Promise.resolve<Fail>({ ok: false, status: 400, error: "Unknown action" });
    }
  };
  if (b.stream === true && (b.action === "add_policy" || b.action === "onboard")) {
    const enc = new TextEncoder();
    const body = new ReadableStream({
      async start(c) {
        const send = (o: unknown) => c.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        try { send({ done: await go((stage) => send({ stage })) }); } catch (e) { send({ done: { ok: false, status: 500, error: (e as Error).message } }); }
        c.close();
      },
    });
    return new Response(body, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
  }
  try {
    const out = await go();
    return NextResponse.json(out, { status: out.ok ? 200 : out.status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
