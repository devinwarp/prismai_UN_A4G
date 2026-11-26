import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

/** The former entity-wide configuration endpoint. */
export async function PUT() {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ error: "Edit risk flags on the use-case register." }, { status: 410 });
}
