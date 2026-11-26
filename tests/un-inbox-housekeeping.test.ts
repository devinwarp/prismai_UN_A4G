import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { INFO_KEEP_DAYS, pendingOn, staleInfo, type InboxItem } from "../src/lib/un/inbox.ts";

const item = (o: Partial<InboxItem>): InboxItem => ({
  id: "i", org_id: "o", created_at: "2026-11-26T10:00:00Z", kind: "people.position_missing", mode: "inform", letter: "I", handler: "human", status: "open", user_id: "platform",
  subject: "s", body: "b", entity: null, country: null, use_case_id: null, link: null, payload: {}, dedupe_key: "pos:UC04", attempts: 0, blocked_reason: null,
  escalate_at: null, escalated_at: null, escalated_from: null, read_at: null, resolved_at: null, resolved_by: null, created_by: "system", ...o,
});
const people: Record<string, { name: string; job_title: string | null }> = { admin: { name: "Latifa Al Mansoori", job_title: "AI Programme Director" }, platform: { name: "Hind", job_title: null } };

test("an information item names the people asked to act on the same event, and only those still open", () => {
  const info = item({ id: "a", user_id: "platform" });
  const action = item({ id: "b", user_id: "admin", mode: "action", letter: "AR", handler: "human" });
  const closed = item({ id: "c", user_id: "other", mode: "action", letter: "R", status: "done" });
  const elsewhere = item({ id: "d", user_id: "admin", mode: "action", letter: "AR", dedupe_key: "pos:UC07" });
  const open = [info, action, elsewhere].filter((i) => i.status === "open");
  const w = pendingOn(info, [...open, closed].filter((i) => i.status !== "done"), (id) => people[id]);
  assert.deepEqual(w, [{ name: "Latifa Al Mansoori", job_title: "AI Programme Director", letter: "AR", mode: "action", handler: "human" }]);
});

test("information about something nobody is asked to do names nobody, and an action names nobody but its owner", () => {
  const info = item({});
  assert.deepEqual(pendingOn(info, [info], (id) => people[id]), []);
  const action = item({ mode: "action", letter: "AR" });
  assert.deepEqual(pendingOn(action, [action, item({ user_id: "admin", mode: "action" })], (id) => people[id]), []);
});

test("information left for more than the keep period is archived; fresh information, actions and closed items are not", () => {
  const now = new Date("2026-12-20T10:00:00Z");
  const old = item({ id: "old", created_at: "2026-11-26T10:00:00Z" });
  const fresh = item({ id: "fresh", created_at: "2026-12-15T10:00:00Z" });
  const act = item({ id: "act", mode: "action", created_at: "2026-11-01T10:00:00Z" });
  const away = item({ id: "away", status: "dismissed", created_at: "2026-11-01T10:00:00Z" });
  assert.deepEqual(staleInfo([old, fresh, act, away], now).map((i) => i.id), ["old"]);
  assert.equal(INFO_KEEP_DAYS, 14);
});

test("the inbox offers put-all-away, restore, an archive, and who an item waits on", () => {
  const route = readFileSync("src/app/api/admin/un/inbox/route.ts", "utf8");
  assert.match(route, /act === "dismiss_all"/);
  assert.match(route, /act === "restore"/);
  assert.match(route, /waiting/);
  const view = readFileSync("src/app/admin/federal/inbox/InboxView.tsx", "utf8");
  assert.match(view, /ib\.dismissall/);
  assert.match(view, /ib\.archive/);
  assert.match(view, /ib\.waiting/);
});

test("information that was put away is not raised again by the next sweep", () => {
  const src = readFileSync("src/lib/un/inbox-store.ts", "utf8");
  assert.match(src, /i\.mode === "inform" && i\.status === "dismissed"/);
});
