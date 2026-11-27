// READ-ONLY: GET requests only. Prints the structure of un_goal_review_log rows: no keys, no free text beyond ids and counts.
import { readFileSync } from "node:fs";
const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:\s#.*)?$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const get = async (p: string) => (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: H })).json();
const rows = (await get("un_goal_review_log?select=*&order=use_case_id,profile,seq")) as Record<string, any>[];
const ucs = (await get("un_use_cases?select=id,ext_id,entity")) as { id: string; ext_id: string; entity: string }[];
const uc = new Map(ucs.map((u) => [u.id, u]));
for (const r of rows) {
  const p = r.payload ?? {};
  const gs = p.goal_set;
  const ids = Array.isArray(gs) ? gs.map((g: any) => g.id).join(",") : gs ? JSON.stringify(Object.keys(gs)) : "-";
  const js = Array.isArray(p.judgments) ? p.judgments.length : "-";
  console.log(`${uc.get(r.use_case_id)?.ext_id ?? r.use_case_id} | ${uc.get(r.use_case_id)?.entity ?? "?"} | ${r.profile} | seq ${r.seq} | ${r.kind} | ${String(r.at).slice(0, 16)} | by ${String(r.actor).split("@")[0]} | goals[${ids}] | judgments ${js}`);
}
const five = rows.find((r) => r.seq === 5 && r.kind === "judged");
console.log("seq5 goal_set ids:", JSON.stringify((five?.payload?.goal_set?.goals ?? []).map((g: any) => g.id)));
const reports = (await get("un_lifecycle_pilot_reports?select=id,at,profile,basis,runs")) as Record<string, any>[];
for (const p of reports) console.log("pilot", String(p.id).slice(0, 8), String(p.at).slice(0, 16), p.profile, "runs", p.runs, "basis", p.basis ? `recomputed from ${String(p.basis.pilot_id).slice(0, 8)} review ${String(p.basis.review_hash).slice(0, 8)}` : "-");
const approved = rows.filter((r) => r.kind === "approved").map((r) => `${r.profile.split(" ")[0]}#${r.seq}:${String(r.payload?.pilot_id).slice(0, 8)}:${String(r.payload?.hash).slice(0, 8)}`);
console.log("approvals:", approved.join("  "));
