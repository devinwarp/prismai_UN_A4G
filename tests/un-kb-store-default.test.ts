import test from "node:test";
import assert from "node:assert/strict";
import { kbUsesSupabase } from "../src/lib/un/kb-store-choice.ts";

// A deployed server must use the Supabase tables by default: its disk is read-only, so the file store made
// the tuning screens fail on the live site. Offline keeps the file store.
const env = (o: Record<string, string | undefined>, f: () => void) => {
  const keep = { ...process.env };
  for (const k of ["OFFLINE", "UN_KB_STORE", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
  Object.assign(process.env, o);
  try { f(); } finally { process.env = keep; }
};
test("a real database uses the Supabase tables by default", () => {
  env({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }, () => assert.equal(kbUsesSupabase(), true));
});
test("offline uses the file store", () => env({ OFFLINE: "1" }, () => assert.equal(kbUsesSupabase(), false)));
test("UN_KB_STORE overrides both ways", () => {
  env({ OFFLINE: "1", UN_KB_STORE: "supabase" }, () => assert.equal(kbUsesSupabase(), true));
  env({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", UN_KB_STORE: "file" }, () => assert.equal(kbUsesSupabase(), false));
});
