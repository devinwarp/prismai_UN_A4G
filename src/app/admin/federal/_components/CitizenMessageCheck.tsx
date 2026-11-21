"use client";

import { useState } from "react";
import { checkCitizenMessage, draftCitizenMessage, type MsgLang } from "@/lib/un/citizen-message";
import { T, useLang } from "./Lang";
import { tr } from "@/lib/un/i18n/dict";
import { Section, btnGhost, btnPrimary, card, field } from "./ui";

/** Drafts and checks a citizen-facing message for the ai_disclosure gate. Rules only; a person still approves it. */
export default function CitizenMessageCheck() {
  const ui = useLang();
  const [lang, setLang] = useState<MsgLang>("ar");
  const [entity, setEntity] = useState("");
  const [contact, setContact] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<ReturnType<typeof checkCitizenMessage> | null>(null);
  return (
    <div className="mt-14">
      <Section id="citizen-message" eyebrow={tr(ui, "ua.cm.eyebrow", "Disclosure gate")} title={tr(ui, "msg.title", "Citizen message check")} lede={tr(ui, "ua.cm.lede", "Checks that a citizen-facing message says it is an AI assistant, offers a real way to reach a person, and is written in the chosen language. Wording only: a person still approves the message.")}>
        <div className={card}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs"><span className="font-medium">{tr(ui, "ua.cm.lang", "Language")}</span>
              <select className={field} value={lang} onChange={(e) => { setLang(e.target.value as MsgLang); setResult(null); }}>
                <option value="ar">العربية</option><option value="en">English</option>
              </select></label>
            <label className="block text-xs"><span className="font-medium">{tr(ui, "ua.cm.entity", "Entity name")}</span>
              <input className={field} dir="auto" value={entity} onChange={(e) => setEntity(e.target.value)} /></label>
            <label className="block text-xs"><span className="font-medium">{tr(ui, "ua.cm.contact", "Contact (phone, email or link)")}</span>
              <input className={field} dir="ltr" value={contact} onChange={(e) => setContact(e.target.value)} /></label>
          </div>
          <label className="mt-3 block text-xs"><span className="font-medium">{tr(ui, "ua.cm.message", "Message")}</span>
            <textarea className={field} dir="auto" rows={4} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} /></label>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={btnGhost} onClick={() => { setText(draftCitizenMessage(entity || "[entity]", contact || "[contact]", lang)); setResult(null); }}><T k="msg.draft" en="Draft" /></button>
            <button type="button" className={btnPrimary} onClick={() => setResult(checkCitizenMessage(text, lang))}><T k="msg.check" en="Check" /></button>
          </div>
          {result && (
            <div role="status" className="mt-4 border-t border-line pt-3 text-sm">
              <p className={`font-medium ${result.ok ? "text-lit-deep" : "text-ember"}`}>{result.ok ? "✓ " : "✕ "}<T k={result.ok ? "msg.pass" : "msg.fail"} en={result.ok ? "All checks passed" : "Some checks failed"} /></p>
              <ul className="mt-2 space-y-1">
                {result.checks.map((c) => (
                  <li key={c.id}><span aria-hidden>{c.ok ? "✓" : "✕"}</span> <bdi dir="ltr" className="font-mono text-xs">{c.id}</bdi> <span className="text-ink-soft">{c.detail}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
