"use client";

import { useState } from "react";
import { checkCitizenMessage, draftCitizenMessage, type MsgLang } from "@/lib/un/citizen-message";
import { T } from "./Lang";
import { Section, btnGhost, btnPrimary, card, field } from "./ui";

/** Drafts and checks a citizen-facing message for the ai_disclosure gate. Rules only; a person still approves it. */
export default function CitizenMessageCheck() {
  const [lang, setLang] = useState<MsgLang>("ar");
  const [entity, setEntity] = useState("");
  const [contact, setContact] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<ReturnType<typeof checkCitizenMessage> | null>(null);
  return (
    <div className="mt-14">
      <Section id="citizen-message" eyebrow="Disclosure gate" title="Citizen message check" lede="Checks that a citizen-facing message says it is an AI assistant, offers a real way to reach a person, and is written in the chosen language. Wording only: a person still approves the message.">
        <div className={card}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs"><span className="font-medium">Language</span>
              <select className={field} value={lang} onChange={(e) => { setLang(e.target.value as MsgLang); setResult(null); }}>
                <option value="ar">العربية</option><option value="en">English</option>
              </select></label>
            <label className="block text-xs"><span className="font-medium">Entity name</span>
              <input className={field} value={entity} onChange={(e) => setEntity(e.target.value)} /></label>
            <label className="block text-xs"><span className="font-medium">Contact (phone, email or link)</span>
              <input className={field} dir="ltr" value={contact} onChange={(e) => setContact(e.target.value)} /></label>
          </div>
          <label className="mt-3 block text-xs"><span className="font-medium">Message</span>
            <textarea className={field} rows={4} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} /></label>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={btnGhost} onClick={() => { setText(draftCitizenMessage(entity || "[entity]", contact || "[contact]", lang)); setResult(null); }}><T k="msg.draft" en="Draft" /></button>
            <button type="button" className={btnPrimary} onClick={() => setResult(checkCitizenMessage(text, lang))}><T k="msg.check" en="Check" /></button>
          </div>
          {result && (
            <div role="status" className="mt-4 border-t border-line pt-3 text-sm">
              <p className={`font-medium ${result.ok ? "text-lit-deep" : "text-ember"}`}>{result.ok ? "✓ " : "✕ "}<T k={result.ok ? "msg.pass" : "msg.fail"} en={result.ok ? "All checks passed" : "Some checks failed"} /></p>
              <ul className="mt-2 space-y-1">
                {result.checks.map((c) => (
                  <li key={c.id}><span aria-hidden>{c.ok ? "✓" : "✕"}</span> <span className="font-mono text-xs">{c.id}</span> <span className="text-ink-soft">{c.detail}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
