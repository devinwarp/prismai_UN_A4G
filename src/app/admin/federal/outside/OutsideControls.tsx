"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import { btnPrimary, field } from "../_components/ui";

async function post(path: string, body: object): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Answer one open request (admin only; the page does not render this for a viewer). */
export function AnswerForm({ id }: { id: string }) {
  const router = useRouter();
  const lang = useLang();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await post(`/api/admin/un/outside/${id}/answer`, { answer: text });
    setBusy(false);
    if (!r.ok) setError(String(r.data.error ?? tr(lang, "ub.oq.nosave", "The answer was not saved.")));
    else router.refresh();
  }
  return (
    <form onSubmit={submit} className="mt-3">
      <label className="text-sm font-medium" htmlFor={`ans-${id}`}>{tr(lang, "oq.answer", "Your answer")}</label>
      <textarea id={`ans-${id}`} className={field} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} required />
      <button type="submit" className={`${btnPrimary} mt-2`} disabled={busy || !text.trim()}>{busy ? tr(lang, "oq.saving", "Saving…") : tr(lang, "oq.send", "Record the answer")}</button>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
    </form>
  );
}

/** Ask the agent a question about the demo case, to see an outside request being raised. */
export function AskForm() {
  const router = useRouter();
  const lang = useLang();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const r = await post("/api/admin/un/outside/ask", { question: q });
    setBusy(false);
    if (!r.ok) setResult(String(r.data.error ?? tr(lang, "ub.oq.qfail", "The question failed.")));
    else {
      const d = r.data as { status: string; citations: string[]; person_answer: { answer: string; role: string } | null };
      setResult(d.status === "answered" ? `${tr(lang, "oq.res.answered", "Answered from the SOP, citing")} ${d.citations.join(", ")}`
        : d.status === "answered_by_person" ? `${tr(lang, "oq.res.person", "Answered earlier by a person")} (${d.person_answer?.role}): ${d.person_answer?.answer}`
        : tr(lang, "oq.res.outside", "The SOP cannot answer this, so the agent made the required outside-information call. It is in the queue below."));
      router.refresh();
    }
  }
  return (
    <form onSubmit={submit}>
      <label className="text-sm font-medium" htmlFor="oq-ask">{tr(lang, "oq.ask.label", "Ask the licence-renewal agent a question")}</label>
      <input id="oq-ask" className={field} value={q} maxLength={400} onChange={(e) => setQ(e.target.value)} placeholder={tr(lang, "oq.ask.ph", "For example: what is the corporate tax rate for my company?")} required />
      <button type="submit" className={`${btnPrimary} mt-2`} disabled={busy || !q.trim()}>{busy ? tr(lang, "oq.asking", "Asking…") : tr(lang, "oq.ask.go", "Ask")}</button>
      {result && <p role="status" className="mt-2 text-sm">{result}</p>}
    </form>
  );
}
