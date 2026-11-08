import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { parseUseCases } from "@/lib/un/model";
import { importUnUseCases } from "@/lib/un/store";

/** POST text/csv body (or { csv }) → { imported } | 400 { error, errors[] } */
export async function POST(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const raw = await request.text();
  if (raw.length > 1_000_000) return bad("File is too large");
  let csv = raw;
  if (raw.trimStart().startsWith("{")) {
    try {
      csv = String(JSON.parse(raw).csv ?? "");
    } catch {
      return bad("Invalid JSON");
    }
  }
  const { useCases, errors } = parseUseCases(csv);
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors: errors.slice(0, 20) }, { status: 400 });
  }
  const err = await importUnUseCases(who.org_id!, useCases);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  return NextResponse.json({ imported: useCases.length });
}
