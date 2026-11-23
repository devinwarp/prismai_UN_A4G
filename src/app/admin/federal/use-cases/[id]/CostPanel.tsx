import type { Ledger } from "@/lib/un/cost-ledger";
import { STAGES } from "@/lib/un/cost";
import { T, TV } from "../../_components/Lang";
import { card } from "../../_components/ui";

const usd = (v: number | null) => (v === null ? "—" : `$${v.toFixed(v < 1 ? 4 : 2)}`);
const STAGE_EN: Record<(typeof STAGES)[number], string> = { generation: "Test generation", pilot: "Pilot runs", judging: "Goal judging", tuning: "Tuning", production: "Production monitoring" };

/** What the whole process has cost so far: every model call and tool call recorded for test generation, pilots, judging, tuning and production, with
 * the gross total. Dollars come from the price table (data/model-prices.json); a model without a price is listed and the total says it is partial. */
export function CostPanel({ ledger }: { ledger: Ledger }) {
  const s = ledger.summary;
  return (
    <section className={`${card} mt-4`} aria-labelledby="cost-h" data-testid="cost-panel">
      <h2 id="cost-h" className="text-lg font-semibold"><T k="cost.h" en="What this has cost" /></h2>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft"><T k="cost.lede" en="Every model call and tool call made for testing, evaluating, tuning and monitoring this use case, recorded as it happened. Calls and tokens are counted exactly; dollars use the price table the organisation keeps for its models." /></p>
      {s.entries === 0 ? (
        <p className="mt-2 text-sm" role="status"><T k="cost.none" en="No usage has been recorded yet." /></p>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium" role="status">
            <TV k="cost.total" en="Gross total: {calls} model calls and {tools} tool calls ({tokens} tokens) · {usd}" v={{ calls: s.usage.total.calls, tools: s.usage.total.tool_calls, tokens: s.usage.total.prompt_tokens + s.usage.total.completion_tokens, usd: usd(s.usd) }} />
          </p>
          {s.unpriced.length > 0 && <p className="mt-1 text-sm text-ink-soft"><TV k="cost.partial" en="Partial: no price is set for {models}, so their calls are counted but not in the dollar figure." v={{ models: s.unpriced.join(", ") }} /></p>}
          <table className="mt-2 w-full max-w-[68ch] text-sm">
            <thead><tr className="text-xs text-ink-soft"><th className="text-start font-normal"><T k="cost.stage" en="Stage" /></th><th className="text-end font-normal"><T k="cost.calls" en="Model calls" /></th><th className="text-end font-normal"><T k="cost.tools" en="Tool calls" /></th><th className="text-end font-normal"><T k="cost.usd" en="Cost" /></th></tr></thead>
            <tbody>{STAGES.map((st) => { const r = s.by_stage[st]; return <tr key={st}><td><T k={`cost.stage.${st}`} en={STAGE_EN[st]} /></td><td className="text-end tabular-nums">{r.calls}</td><td className="text-end tabular-nums">{r.tool_calls}</td><td className="text-end tabular-nums">{usd(r.usd)}</td></tr>; })}</tbody>
          </table>
        </>
      )}
    </section>
  );
}
