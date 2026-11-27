import { appKbStore } from "./kb-store-app";
import { buildLiveSopKb, checkLiveSopKb, ensureLiveSop, writeLiveSkill, type LiveBuildInput } from "./sop-kb-live";

// The live SOP knowledge base on the app's own store (the database when hosted, a file offline). See sop-kb-live.ts.

/** Call before anything that reads an SOP's chunks (loadSop): makes an uploaded SOP's knowledge base available in this process. A repo SOP on disk is left as it is. */
export const ensureSopKb = (orgId: string, sopId: string | null | undefined) => (sopId ? ensureLiveSop(appKbStore(orgId), sopId) : Promise.resolve("none" as const));
export const buildSopKb = (orgId: string, input: LiveBuildInput) => buildLiveSopKb(appKbStore(orgId), input);
export const checkSopKbFor = (orgId: string, sopId: string, version?: number) => checkLiveSopKb(appKbStore(orgId), sopId, version);
export const writeSkillFor = (orgId: string, sopId: string, profile: string, version?: number) => writeLiveSkill(appKbStore(orgId), sopId, profile, version);
