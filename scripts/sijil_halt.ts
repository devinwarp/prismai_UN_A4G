// The Sijil node's halt switch, for the demo: `on` makes the node seal every call as blocked, `off` resumes. Needs the node's admin token
// (SIJIL_ADMIN_TOKEN), which only a person running this script holds; the app never reads it.
//   SIJIL_BASE_URL=http://127.0.0.1:8000 SIJIL_ADMIN_TOKEN=... node scripts/sijil_halt.ts on|off
const base = (process.env.SIJIL_BASE_URL ?? "").replace(/\/+$/, "");
const admin = process.env.SIJIL_ADMIN_TOKEN ?? "";
const want = process.argv[2];
if (!base || !admin || (want !== "on" && want !== "off")) { console.error("usage: SIJIL_BASE_URL=... SIJIL_ADMIN_TOKEN=... node scripts/sijil_halt.ts on|off"); process.exit(2); }
const res = await fetch(base + "/api/admin/halt", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${admin}` }, body: JSON.stringify({ halted: want === "on" }) });
if (!res.ok) { console.error(`halt returned HTTP ${res.status}`); process.exit(1); }
console.log(`halted=${((await res.json()) as { halted: boolean }).halted}`);
