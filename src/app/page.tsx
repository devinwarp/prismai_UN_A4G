import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";
import { isOffline } from "@/lib/supabase/offline-flag";
import { createClient } from "@/lib/supabase/server";
import { judgeLoginAvailable } from "@/lib/un/judge-login";

export const metadata: Metadata = {
  title: { absolute: "Prism: know when a government AI helper is safe to switch on" },
  description:
    "Prism checks a government AI service against the rules, gives a plain answer, and signs it in a tamper-proof logbook. Read-only live demo, synthetic data.",
  openGraph: { title: "Know when a government AI helper is safe to switch on, and prove it.", url: "/" },
  twitter: { title: "Know when a government AI helper is safe to switch on, and prove it." },
};

async function isSignedIn(): Promise<boolean> {
  if (isOffline()) return false; // offline auto-login makes everyone "signed in"; show the visitor view
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    return !!data?.claims;
  } catch {
    return false;
  }
}

export default async function Home() {
  const signedIn = await isSignedIn();
  // Judge route when it works; otherwise the login page, which explains the options.
  const judgeHref = judgeLoginAvailable() ? "/api/judge-login" : "/login";
  return <Landing signedIn={signedIn} judgeHref={judgeHref} />;
}
