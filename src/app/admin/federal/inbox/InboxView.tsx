"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { DEFAULT_RACI, POSITIONS, STEPS, STEP_LABELS, type Letter } from "@/lib/un/raci";
import type { InboxItem } from "@/lib/un/inbox";
import { useLang } from "../_components/Lang";
import WorkIcon from "../_components/WorkIcon";

interface Settings { enabled: boolean; daily_cap: number }
interface LogEntry { seq: number; at: string; action: string; outcome: "done" | "blocked" | "skipped" }
interface Waiting { name: string; job_title: string | null; letter: Letter; mode: string; handler: string }
interface Data { waiting?: Record<string, Waiting[]>; items: InboxItem[]; counts: { todo: number; info: number; agent: number }; settings: Settings; log: LogEntry[]; log_ok: boolean }
interface Staged { job_title: string | null; role: string | null; entity: string | null; use_case_id: string | null; ext_id: string | null; suggested_email: string }

const field = "mt-1 block w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-lit focus:ring-1 focus:ring-lit";
const btn = "inline-flex min-h-10 items-center justify-center rounded-lg border border-ink px-4 text-sm font-medium text-ink hover:bg-paper-deep disabled:opacity-60";
const btnPrimary = "inline-flex min-h-10 items-center justify-center rounded-lg bg-lit-deep px-4 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
const LETTER_EN: Record<Letter, string> = { R: "Responsible", A: "Accountable", AR: "Responsible and accountable", C: "Consulted", I: "Informed" };

async function call(method: "GET" | "POST", url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

function StagedUser({ item, onDone }: { item: InboxItem; onDone: (msg: string) => void }) {
  const lang = useLang();
  const staged = item.payload.staged as Staged;
  const [email, setEmail] = useState(staged.suggested_email);
  const [name, setName] = useState("");
  const [title, setTitle] = useState(staged.job_title ?? "");
  const [role, setRole] = useState(staged.role ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    const r = await call("POST", "/api/admin/un/users", { email, name, job_title: title, entity: item.entity, use_case_id: staged.use_case_id, role: role || undefined, item_id: item.id });
    setBusy(false);
    if (!r.ok) { setError(r.json.error ?? "Could not create the user"); return; }
    onDone(`${tr(lang, "ib.created", "User {email} created.").replace("{email}", r.json.email)} ${r.json.password ? tr(lang, "ib.password", "Temporary password (shown once): {p}").replace("{p}", r.json.password) : tr(lang, "ib.nopassword", "Offline: no password. Use the Sign in as picker.")}`);
  };
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper-deep/50 p-3">
      <p className="text-sm text-ink-soft">{tr(lang, "ib.staged", "Your agent staged a user for you to confirm. An account is only created when you confirm.")}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">{tr(lang, "ib.email", "Email")}<input className={field} value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" /></label>
        <label className="text-xs font-medium">{tr(lang, "ib.name", "Name")}<input className={field} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="text-xs font-medium">{tr(lang, "ib.jobtitle", "Job position")}<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="text-xs font-medium">{tr(lang, "ib.role", "Role")}
          <select className={field} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">{tr(lang, "ib.role.none", "No role yet")}</option>
            {["operator", "process_owner", "test_author"].map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}
      <button type="button" className={`${btnPrimary} mt-3`} disabled={busy || !email || !name || !title} onClick={() => void submit()}>{tr(lang, "ib.create", "Create the user")}</button>
    </div>
  );
}

function Card({ item, act, onMsg, waiting }: { item: InboxItem; act: (a: string, id: string, extra?: Record<string, unknown>) => Promise<void>; onMsg: (m: string) => void; waiting?: Waiting[] }) {
  const lang = useLang();
  const staged = item.payload.staged as Staged | undefined;
  const draft = item.payload.draft as string | undefined;
  const [reply, setReply] = useState(draft ?? "");
  const tag = item.handler === "agent" ? "agent_progress" : "human";
  return (
    <li className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <WorkIcon kind={tag} />
        <p className="font-medium">{item.subject}</p>
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {tr(lang, `ib.${item.letter}`, LETTER_EN[item.letter])} · {item.entity ?? "—"} · <bdi dir="ltr">{when(item.created_at)}</bdi>
        {item.escalated_from && <> · {tr(lang, "ib.escalated", "Escalated to you: nobody dealt with it in two working days.")}</>}
      </p>
      <p className="mt-2 text-sm whitespace-pre-line text-ink-soft">{item.body}</p>
      {item.mode === "inform" && waiting && waiting.length > 0 && (
        <p className="mt-1 text-xs text-ink-soft">
          <span className="font-medium">{tr(lang, "ib.waiting", "Waiting on")}:</span>{" "}
          {waiting.map((w, k) => <span key={k}>{k > 0 && "; "}{w.name}{w.job_title ? `, ${w.job_title}` : ""} ({w.mode === "approval" ? tr(lang, "ib.w.decide", "to decide") : w.mode === "consult" ? tr(lang, "ib.w.input", "asked for input") : tr(lang, "ib.w.act", "to act")}, {w.handler === "agent" ? tr(lang, "ib.w.agent", "their agent is on it") : tr(lang, "ib.w.human", "a person")})</span>)}
        </p>
      )}
      {item.mode !== "inform" && item.status !== "done" && item.status !== "dismissed" && <p className="mt-1 text-xs text-ink-soft">{tr(lang, "ib.pending.you", "Pending on: you")}</p>}
      {item.blocked_reason && <p className="mt-2 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{tr(lang, "ib.blocked", "Your agent was stopped: {why}").replace("{why}", item.blocked_reason)}</p>}
      {item.mode === "approval" && <p className="mt-2 text-xs font-medium text-ink-soft">{tr(lang, "ib.decision.note", "A decision for a person. An agent does not take it.")}</p>}
      {staged && item.status !== "done" && <StagedUser item={item} onDone={onMsg} />}
      {item.mode === "consult" && item.status !== "done" && (
        <div className="mt-3">
          <label className="text-xs font-medium" htmlFor={`rp-${item.id}`}>{tr(lang, "ib.reply", "Your reply")}</label>
          {draft && <p className="text-xs text-ink-soft">{tr(lang, "ib.draft", "Drafted by your agent. It is not sent until you send it.")}</p>}
          <textarea id={`rp-${item.id}`} className={`${field} h-32`} value={reply} onChange={(e) => setReply(e.target.value)} />
          <button type="button" className={`${btnPrimary} mt-2`} disabled={!reply.trim()} onClick={() => void act("send", item.id, { reply })}>{tr(lang, "ib.send", "Send the reply")}</button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {item.link && <Link href={item.link} className={btn}>{tr(lang, "ib.open", "Open")}</Link>}
        {item.mode === "action" && !staged && item.status !== "done" && <button type="button" className={btn} onClick={() => void act("done", item.id)}>{tr(lang, "ib.done", "Mark done")}</button>}
        {item.mode === "inform" && <button type="button" className={btn} onClick={() => void act("dismiss", item.id)}>{tr(lang, "ib.dismiss", "Put away")}</button>}
        {item.mode === "inform" && !item.read_at && <button type="button" className="text-sm underline underline-offset-4" onClick={() => void act("read", item.id)}>{tr(lang, "ib.read", "Mark as read")}</button>}
      </div>
    </li>
  );
}

function Section({ id, title, items, act, onMsg, waiting, extra }: { id: string; title: string; items: InboxItem[]; act: (a: string, id: string, extra?: Record<string, unknown>) => Promise<void>; onMsg: (m: string) => void; waiting?: Record<string, Waiting[]>; extra?: React.ReactNode }) {
  const lang = useLang();
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-card p-5">
      <h2 id={id} className="font-display text-xl font-medium">{title} <span className="font-mono text-sm text-ink-soft">({items.length})</span></h2>
      {items.length > 1 && extra}
      {items.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{tr(lang, "ib.empty", "Nothing here.")}</p> : <ul className="mt-3">{items.map((i) => <Card key={i.id} item={i} act={act} onMsg={onMsg} waiting={waiting?.[i.id]} />)}</ul>}
    </section>
  );
}

export default function InboxView() {
  const lang = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cap, setCap] = useState("50");

  const apply = useCallback((r: { ok: boolean; json: Record<string, unknown> }) => {
    if (!r.ok) { setError(String(r.json.error ?? "The inbox could not be loaded")); return; }
    setData(r.json as unknown as Data); setCap(String((r.json.settings as Settings | undefined)?.daily_cap ?? 50)); setError(null);
  }, []);
  const load = useCallback(async () => apply(await call("GET", "/api/admin/un/inbox")), [apply]);
  // opening the inbox is what makes the People agent sweep and the person's agent work: one load on open
  useEffect(() => {
    let live = true;
    void call("GET", "/api/admin/un/inbox").then((r) => { if (live) apply(r); });
    return () => { live = false; };
  }, [apply]);

  const act = async (action: string, id: string, extra: Record<string, unknown> = {}) => {
    const r = await call("POST", "/api/admin/un/inbox", { action, id, ...extra });
    if (!r.ok) setError(r.json.error ?? "That did not work"); else setError(null);
    await load();
  };
  const onMsg = (m: string) => { setMsg(m); void load(); };
  const saveAgent = async (patch: Partial<Settings>) => {
    const r = await call("POST", "/api/admin/un/agent", patch);
    if (!r.ok) setError(r.json.error ?? "The setting was not saved");
    await load();
  };

  if (!data) return <p className="text-sm text-ink-soft">{error ?? tr(lang, "ib.loading", "Loading…")}</p>;
  const open = data.items.filter((i) => i.status !== "done" && i.status !== "dismissed");
  const by = (m: string) => open.filter((i) => i.mode === m && (i.handler === "human"));
  const withAgent = open.filter((i) => i.handler === "agent");
  const closed = data.items.filter((i) => i.status === "done" || i.status === "dismissed");
  return (
    <div className="space-y-5">
      {error && <p role="alert" className="text-sm text-ember">{error}</p>}
      {msg && <p role="status" className="rounded-lg border border-lit/40 bg-lit-soft px-3 py-2 text-sm whitespace-pre-line text-lit-deep">{msg}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Section id="ib-todo" title={tr(lang, "ib.todo", "To do")} items={by("action")} act={act} onMsg={onMsg} />
          <Section id="ib-decisions" title={tr(lang, "ib.decisions", "Decisions for you")} items={by("approval")} act={act} onMsg={onMsg} />
          <Section id="ib-consult" title={tr(lang, "ib.consult", "Your input is asked")} items={by("consult")} act={act} onMsg={onMsg} />
          <Section id="ib-info" title={tr(lang, "ib.info", "For your information")} items={by("inform")} act={act} onMsg={onMsg} waiting={data.waiting} extra={<div className="mt-2 flex flex-wrap gap-3"><button type="button" className={btn} onClick={() => void act("dismiss_all", "")}>{tr(lang, "ib.dismissall", "Put all away")}</button><p className="self-center text-xs text-ink-soft">{tr(lang, "ib.archive.note", "Put away is an archive: nothing is deleted. Information is also put away after 14 days.")}</p></div>} />
          {closed.length > 0 && (
            <details className="rounded-2xl border border-line bg-card p-5">
              <summary className="cursor-pointer font-display text-xl font-medium">{tr(lang, "ib.archive", "Archive")} <span className="font-mono text-sm text-ink-soft">({closed.length})</span></summary>
              <ul className="mt-3 divide-y divide-line text-sm">
                {closed.slice(0, 50).map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="font-medium">{i.subject}</span>
                    <span className="text-xs text-ink-soft">{i.status === "done" ? tr(lang, "ib.archive.done", "Done") : tr(lang, "ib.archive.away", "Put away")} · <bdi dir="ltr">{when(i.resolved_at ?? i.created_at)}</bdi></span>
                    {i.status === "dismissed" && <button type="button" className="ms-auto text-sm underline underline-offset-4" onClick={() => void act("restore", i.id)}>{tr(lang, "ib.restore", "Bring back")}</button>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {withAgent.length > 0 && <Section id="ib-agentwork" title={tr(lang, "ib.agentwork", "Your agent is on these")} items={withAgent} act={act} onMsg={onMsg} />}
        </div>
        <aside className="space-y-5">
          <section aria-labelledby="ib-agent" className="rounded-2xl border border-line bg-card p-5">
            <h2 id="ib-agent" className="font-display flex items-center gap-2 text-xl font-medium"><WorkIcon kind={data.settings.enabled ? "agent_progress" : "human"} compact />{tr(lang, "ib.agent", "Your agent")}</h2>
            <p className="mt-2 text-sm text-ink-soft">{data.settings.enabled ? tr(lang, "ib.agent.on", "Your agent works your items.") : tr(lang, "ib.agent.off", "Your agent is off: everything is yours.")}</p>
            <button type="button" role="switch" aria-checked={data.settings.enabled} className={`${btn} mt-3`} onClick={() => void saveAgent({ enabled: !data.settings.enabled })}>{data.settings.enabled ? "On" : "Off"}</button>
            <label className="mt-4 block text-xs font-medium" htmlFor="ib-cap">{tr(lang, "ib.agent.cap", "Daily limit on its actions")}</label>
            <div className="mt-1 flex gap-2">
              <input id="ib-cap" inputMode="numeric" className={`${field} mt-0 w-24`} value={cap} onChange={(e) => setCap(e.target.value)} />
              <button type="button" className={btn} onClick={() => void saveAgent({ daily_cap: Number(cap) })}>{tr(lang, "ib.agent.save", "Save")}</button>
            </div>
            <p className="mt-3 text-xs text-ink-soft">{tr(lang, "ib.agent.never", "An agent never takes a decision: no approval, no signature, no deployment, no account.")}</p>
          </section>
          <section aria-labelledby="ib-log" className="rounded-2xl border border-line bg-card p-5">
            <h2 id="ib-log" className="font-display text-xl font-medium">{tr(lang, "ib.log", "What your agent did")}</h2>
            <p className={`mt-1 text-xs ${data.log_ok ? "text-ink-soft" : "font-medium text-ember"}`}>{data.log_ok ? tr(lang, "ib.log.ok", "The log checks out.") : tr(lang, "ib.log.bad", "The log was altered: do not trust it.")}</p>
            {data.log.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{tr(lang, "ib.empty", "Nothing here.")}</p> : (
              <ul className="mt-2 divide-y divide-line text-sm">
                {data.log.slice(0, 10).map((e) => (
                  <li key={e.seq} className="flex items-center gap-2 py-2"><WorkIcon kind={e.outcome === "done" ? "agent_done" : "human"} compact /><span className="font-mono text-xs">{e.action.replaceAll("_", " ")}</span><span className="ms-auto text-xs text-ink-soft"><bdi dir="ltr">{when(e.at)}</bdi></span></li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      <details className="rounded-2xl border border-line bg-card p-5">
        <summary className="cursor-pointer font-display text-xl font-medium">{tr(lang, "ib.raci", "How items reach people")}</summary>
        <p className="mt-2 text-sm text-ink-soft">{tr(lang, "ib.raci.lede", "The default for each step, by position. It can be changed for one person on one use case.")} {tr(lang, "ib.raci.legend", "R responsible, A accountable (decides), C consulted, I informed.")}</p>
        <p className="mt-2 text-sm"><Link href="/admin/federal/raci" className="underline underline-offset-4">{tr(lang, "rc.edit", "See and change it for one use case")}</Link></p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-start font-mono text-[11px] tracking-wide text-ink-soft uppercase"><tr><th scope="col" className="py-2 text-start font-normal">{tr(lang, "ib.raci.step", "Step")}</th>{POSITIONS.map((p) => <th key={p} scope="col" className="px-2 py-2 text-center font-normal">{tr(lang, `ib.pos.${p}`, p.replace("_", " "))}</th>)}</tr></thead>
            <tbody>{STEPS.map((s) => <tr key={s} className="border-t border-line"><th scope="row" className="py-2 text-start font-normal">{STEP_LABELS[s]}</th>{POSITIONS.map((p) => <td key={p} className="px-2 py-2 text-center font-mono">{DEFAULT_RACI[s][p] ?? "–"}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
