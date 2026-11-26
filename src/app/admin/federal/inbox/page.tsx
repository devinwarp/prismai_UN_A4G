import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import ToolWorkspace from "../_components/ToolWorkspace";
import { T } from "../_components/Lang";
import InboxView from "./InboxView";

export const metadata: Metadata = { title: "Inbox", robots: { index: false, follow: false } };

// what is in the inbox changes with every event: never prerender it
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/inbox");
  if (!profile?.org_id) redirect("/login");
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  return (
    <ToolWorkspace orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="ib.title" en="Inbox" />}
      description={<T k="ib.desc" en="What needs you, what your agent is on, and what is for your information. Your agent works within your permissions and never takes a decision: the decisions are yours." />}>
      <InboxView />
    </ToolWorkspace>
  );
}
