import type { User } from "@supabase/supabase-js";
import { cache } from "react";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function judgeEmails(): string[] {
  return (process.env.JUDGE_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function platformEmails(): string[] {
  return (process.env.PLATFORM_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const getUserAndProfile = cache(async (): Promise<{
  user: User | null;
  profile: Profile | null;
}> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile: profile as Profile | null };
});

/** Ensure a profile row exists; promotes PLATFORM_EMAILS/ADMIN_EMAILS users. */
export async function ensureProfile(user: User): Promise<Profile | null> {
  const admin = createAdminClient();
  const email = (user.email ?? "").toLowerCase();
  const isPlatformEmail = platformEmails().includes(email);
  const isAdminEmail = adminEmails().includes(email);
  await admin.from("profiles").upsert(
    {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? null,
      role: isPlatformEmail ? "platform" : isAdminEmail ? "admin" : "employee",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (isPlatformEmail) {
    await admin
      .from("profiles")
      .update({ role: "platform" })
      .eq("id", user.id)
      .neq("role", "platform");
  } else if (isAdminEmail) {
    await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", user.id)
      .neq("role", "admin");
  }

  // Judges: read-only "viewer" in the demo workspace (JUDGE_ORG_ID, else the first admin's).
  // Never demotes an admin or platform user. Writes stay blocked by requireAdmin.
  if (judgeEmails().includes(email) && !isPlatformEmail && !isAdminEmail) {
    let orgId = process.env.JUDGE_ORG_ID ?? null;
    if (!orgId) {
      const { data: a } = await admin.from("profiles").select("org_id").eq("role", "admin").limit(1).maybeSingle();
      orgId = (a?.org_id as string | null) ?? null;
    }
    if (orgId) await admin.from("profiles").update({ role: "viewer", org_id: orgId }).eq("id", user.id).in("role", ["employee", "viewer"]);
  }

  const { data } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // The /admin/federal pages need an org and nothing else creates one (the
  // signup/onboarding flow was trimmed), so give an org-less admin a workspace.
  if (data?.role === "admin" && !data.org_id) {
    const { data: org } = await admin
      .from("organizations")
      .insert({ name: "Federal entity", status: "active" })
      .select("id")
      .single();
    if (org) {
      await admin.from("profiles").update({ org_id: org.id }).eq("id", user.id).is("org_id", null);
      data.org_id = org.id;
    }
  }
  return data as Profile | null;
}
