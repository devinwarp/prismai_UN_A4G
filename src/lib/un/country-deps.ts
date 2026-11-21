import { readFileSync } from "node:fs";
import path from "node:path";
import type { Deps } from "./country-actions.ts";
import { readStaged } from "./country-build.ts";
import type { CountryStore } from "./country-store.ts";
import { EMPTY_GOV } from "./gates.ts";
import { loadChunks } from "./kb.ts";
import { parseUseCases } from "./model.ts";
import { loadSop } from "./sop-kb.ts";
import { loadBaseline } from "./sop/data.ts";
import { loadVectors } from "./vector.ts";

// The file-backed parts of Deps (the corpus, the staged files, the samples). The app adds the store and the use case rows.
type Fixed = Pick<Deps, "corpus" | "vectors" | "staged" | "sample" | "baseline" | "marsa" | "now" | "clock">;
const root = () => process.cwd();

export function fileDeps(): Fixed {
  const corpus = loadChunks();
  return {
    corpus, vectors: loadVectors(corpus) as Deps["vectors"],
    staged: (dir) => readStaged(dir),
    sample: (id) => (id === "sg-mbla" ? readFileSync(path.join(root(), "data/sops/sg-mbla-licence-renewal-sop.md"), "utf8") : null),
    baseline: loadBaseline,
    marsa: async () => {
      const uc = parseUseCases(readFileSync(path.join(root(), "data/un-use-cases.csv"), "utf8")).useCases.find((u) => u.ext_id === "UC02")!;
      return {
        sopMarkdown: readFileSync(path.join(root(), "data/sops/uc02-trade-licence-renewal-sop.md"), "utf8"),
        sopChunks: loadSop("SOP-LIC-014").chunks,
        facts: { client_facing: uc.client_facing, affects_rights: uc.affects_rights, irreversible: uc.irreversible },
        entity: uc.entity,
      };
    },
    now: () => new Date().toISOString(),
    clock: () => performance.now(),
  };
}

/** In-memory store, for tests. */
export function memoryStore(): CountryStore {
  const log: Awaited<ReturnType<CountryStore["log"]>> = [];
  const blobs = new Map<string, unknown>();
  return {
    log: async () => [...log],
    append: async (e) => { log.push(...e); },
    putBlob: async (k, b) => { blobs.set(k, b); },
    getBlob: async (k) => blobs.get(k) ?? null,
    delBlob: async (k) => { blobs.delete(k); },
  };
}
export const noGov = async () => EMPTY_GOV;
