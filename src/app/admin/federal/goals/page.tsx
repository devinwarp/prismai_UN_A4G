import { redirect } from "next/navigation";

// The goals screen's controls now live on the setup page (step 2, entity goals and measures). This route stays so that saved links keep working.
export const dynamic = "force-dynamic";

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ country?: string; entity?: string }> }) {
  const q = await searchParams;
  const next = new URLSearchParams({ step: "goals" });
  if (typeof q.country === "string" && q.country) next.set("country", q.country);
  if (typeof q.entity === "string" && q.entity) next.set("entity", q.entity);
  redirect(`/admin/federal/setup?${next}#step-goals`);
}
