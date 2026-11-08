import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
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

export async function getUserAndProfile(): Promise<{
  user: User | null;
  profile: Profile | null;
}> {
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
}

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
