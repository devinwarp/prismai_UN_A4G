import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLike } from "./kb-store-supabase";
import type { Deps } from "./country-actions";
import { countryStore } from "./country-store";
import { fileDeps, noGov } from "./country-deps";
import { embedDocuments } from "./vector";
import { importUnUseCases, loadUnUseCases } from "./store";

/** The deps the app uses for one organisation. Same code on both paths: createAdminClient() is the real Supabase
 * client when hosted and the file-backed stand-in when OFFLINE=1. Vectors use the local embedding model (no API key)
 * unless COUNTRY_VECTORS=off; if it is not available the build says so and runs on BM25 alone. */
export function appCountryDeps(orgId: string): Deps {
  const f = fileDeps();
  return {
    ...f,
    store: countryStore(createAdminClient() as unknown as SupabaseLike, orgId),
    embed: process.env.COUNTRY_VECTORS === "off" ? null : (texts) => embedDocuments(texts, 25_000),
    // The country demo judges UC02 under the shipped rule sets only. Use-case gates and waivers added on the lifecycle screens
    // belong to those screens; reading them here made the hosted UAE run differ from the offline one (a waiver and an added gate flipped it).
    gov: noGov,
    useCases: {
      upsert: (uc) => importUnUseCases(orgId, [uc]),
      remove: async (ext) => { await createAdminClient().from("un_use_cases").delete().eq("org_id", orgId).eq("ext_id", ext); },
    },
    // UC02's flags come from the organisation's own row when it has one
    marsa: async () => {
      const base = await f.marsa();
      const uc = (await loadUnUseCases(orgId)).find((u) => u.ext_id === "UC02");
      return uc ? { ...base, facts: { client_facing: uc.client_facing, affects_rights: uc.affects_rights, irreversible: uc.irreversible }, entity: uc.entity } : base;
    },
  };
}
