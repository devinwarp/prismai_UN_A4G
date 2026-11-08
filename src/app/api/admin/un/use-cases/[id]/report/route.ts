import { NextResponse } from "next/server";
import { caller } from "@/lib/api-auth";
import { loadReports, loadUseCase } from "@/lib/un/sijil-store";

/** GET → the latest filed pilot report as a Markdown download. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await caller();
  if (!who?.org_id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const uc = await loadUseCase(who.org_id, id);
  const report = uc && (await loadReports(who.org_id, id))[0];
  if (!uc || !report) return NextResponse.json({ error: "No report filed yet" }, { status: 404 });
  return new NextResponse(report.content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="pilot-report-${uc.ext_id}.md"`,
    },
  });
}
