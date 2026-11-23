import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { NO_PRICES, parsePrices, type PriceTable } from "./cost.ts";

// The price table the cost ledger prices tokens with: data/model-prices.json, which the organisation fills from its provider's pricing, and
// MODEL_PRICES_JSON (same shape) which overrides it. A missing or unreadable file is "no prices": tokens are still counted, nothing is priced.

const FILE = () => path.join(process.cwd(), "data", "model-prices.json");
let cache: { mtime: number; table: PriceTable } | null = null;

export function prices(env: Record<string, string | undefined> = process.env): PriceTable {
  let table = NO_PRICES;
  try {
    const f = FILE();
    const mtime = statSync(f).mtimeMs;
    if (!cache || cache.mtime !== mtime) cache = { mtime, table: parsePrices(JSON.parse(readFileSync(f, "utf8"))) };
    table = cache.table;
  } catch { /* no file: no prices */ }
  if (env.MODEL_PRICES_JSON) {
    try {
      const o = parsePrices(JSON.parse(env.MODEL_PRICES_JSON));
      table = { models: { ...table.models, ...o.models }, tool_call: o.tool_call ?? table.tool_call };
    } catch { /* an unreadable override is ignored, not guessed at */ }
  }
  return table;
}
