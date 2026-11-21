import { VERDICTS } from "./model.ts";
import { GATES } from "./policy.ts";
import { ROLES } from "./roles.ts";
import type { GateScenario } from "./scenario.ts";
import type { RoutedEvent } from "./round.ts";

// Blind scenarios: authored as JSON without reading the rule code, validated
// here, run by `scripts/eval_agents.ts --scenarios-file`. Schema in
// docs/eval/blind-scenarios-howto.md. Gate scenarios only.

const REQUESTED = ["GO_AUTONOMOUS", "GO_SUPERVISED", "ASSISTANT_ONLY"];
const AGENT_ROLES = Object.keys(ROLES).filter((r) => r !== "coordinator");
const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Parse and validate a scenarios file. Throws one Error listing every problem found. */
export function parseScenarios(json: string): GateScenario[] {
  const errs: string[] = [];
  let doc: unknown;
  try { doc = JSON.parse(json); } catch (e) { throw new Error(`not valid JSON: ${(e as Error).message}`); }
  const list = (doc as { scenarios?: unknown })?.scenarios;
  if (!Array.isArray(list) || !list.length) throw new Error('top level must be {"scenarios": [ ... ]} with at least one scenario');
  const ids = new Set<string>();
  const out: GateScenario[] = [];
  list.forEach((s: Record<string, unknown>, i) => {
    const at = `scenarios[${i}]`;
    const bad = (m: string) => errs.push(`${at}: ${m}`);
    if (typeof s?.id !== "string" || !ID.test(s.id)) return bad("id must be letters, digits, - or _ (max 40)");
    if (["S1", "S2", "S3", "S4", "R1", "R2", "R3", "R4", "R5"].includes(s.id)) bad(`id ${s.id} is taken by a built-in scenario`);
    if (ids.has(s.id)) bad(`duplicate id ${s.id}`);
    ids.add(s.id);
    if (typeof s.title !== "string" || !s.title.trim()) bad("title is required");
    if (typeof s.ext_id !== "string" || !s.ext_id.trim()) bad("ext_id is required (e.g. UC99)");
    if (typeof s.client_facing !== "boolean") bad("client_facing must be true or false");
    if (!REQUESTED.includes(s.requested as string)) bad(`requested must be one of ${REQUESTED.join(", ")}`);
    const steps = s.steps;
    if (!Array.isArray(steps) || !steps.length) return bad("steps must be a non-empty list");
    const eventIds = new Set<string>();
    const parsed: GateScenario["steps"] = [];
    steps.forEach((st: Record<string, unknown>, j) => {
      const sa = `${at}.steps[${j}]`;
      const sb = (m: string) => errs.push(`${sa}: ${m}`);
      if (typeof st?.step !== "string" || !st.step) sb("step name is required (e.g. T0)");
      if (!(VERDICTS as readonly string[]).includes(st?.expected as string)) sb(`expected must be one of ${VERDICTS.join(", ")}`);
      if (!Array.isArray(st?.events) || !st.events.length) return sb("events must be a non-empty list");
      const events: RoutedEvent[] = [];
      (st.events as Record<string, unknown>[]).forEach((e, k) => {
        const ea = `${sa}.events[${k}]`;
        const eb = (m: string) => errs.push(`${ea}: ${m}`);
        if (typeof e?.id !== "string" || !ID.test(e.id)) eb("id must be letters, digits, - or _ (max 40)");
        else if (eventIds.has(e.id)) eb(`duplicate event id ${e.id}`);
        else eventIds.add(e.id);
        if (typeof e?.summary !== "string" || !e.summary.trim() || e.summary.length > 600) eb("summary is required (up to 600 characters)");
        const rec = e?.recipients;
        if (!Array.isArray(rec) || !rec.length || !rec.every((r) => AGENT_ROLES.includes(r))) eb(`recipients must be a non-empty list of: ${AGENT_ROLES.join(", ")}`);
        if (Boolean(e?.gate) !== Boolean(e?.status)) eb("gate and status go together: set both or neither");
        if (e?.gate && !Object.hasOwn(GATES, e.gate as string)) eb(`unknown gate ${String(e.gate)}; known: ${Object.keys(GATES).join(", ")}`);
        if (e?.status && !["pass", "fail", "fix_declared"].includes(e.status as string)) eb("status must be pass, fail or fix_declared");
        events.push({ id: String(e?.id), type: e?.gate ? "gate_evidence" : "context", summary: String(e?.summary ?? ""), recipients: (rec ?? []) as RoutedEvent["recipients"], gate: e?.gate as RoutedEvent["gate"], status: e?.status as RoutedEvent["status"] });
      });
      parsed.push({ step: String(st?.step), expected: st?.expected as GateScenario["steps"][number]["expected"], events });
    });
    out.push({ kind: "gate", id: s.id, title: String(s.title), ext_id: String(s.ext_id), clientFacing: s.client_facing === true, requested: s.requested as GateScenario["requested"], steps: parsed });
  });
  if (errs.length) throw new Error(`scenarios file is invalid:\n- ${errs.join("\n- ")}`);
  return out;
}
