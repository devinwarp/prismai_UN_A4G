// Deterministic check of a citizen-facing message against the ai_disclosure
// gate. Rules only, no model: it checks that the wording is present, not that
// the message is good. A person still approves it (human_final_approval).
export type MsgLang = "ar" | "en";

export interface MsgCheck {
  id: "ai_disclosure" | "human_route" | "language";
  ok: boolean;
  detail: string;
}

const DISCLOSURE: Record<MsgLang, RegExp> = {
  ar: /(مساعد|مساعدة|روبوت|نظام)\s*(ال)?(ذكي|آلي)|ذكاء\s*اصطناعي|ذكاء\s*صناعي/,
  en: /\b(AI|artificial intelligence)\b.{0,20}\b(assistant|system|bot)\b|\b(assistant|bot)\b.{0,20}\bAI\b/i,
};
const HUMAN: Record<MsgLang, RegExp> = {
  ar: /(موظف|شخص|ممثل|فريق)\s*(بشري|مختص|خدمة)?|التحدث\s*(مع|إلى)\s*(موظف|شخص)|تواصل\s*مع/,
  en: /\b(speak|talk|connect)\b.{0,25}\b(person|human|agent|staff|officer)\b|\bhuman\b/i,
};
// A real route: phone digits, an email, or a URL; placeholders like [phone] do not count.
const CHANNEL = /(\d[\d\s-]{2,}\d)|\S+@\S+\.\S+|https?:\/\/\S+/;
const PLACEHOLDER = /\[[^\]]+\]|<[^>]+>|\{[^}]+\}/;

const ARABIC_LETTER = /[؀-ۿ]/g;
const LATIN_LETTER = /[A-Za-z]/g;

/** Share of letters that are Arabic (0..1); 0 when there are no letters. */
export function arabicShare(text: string): number {
  const ar = (text.match(ARABIC_LETTER) ?? []).length;
  const la = (text.match(LATIN_LETTER) ?? []).length;
  return ar + la === 0 ? 0 : ar / (ar + la);
}

export function checkCitizenMessage(text: string, lang: MsgLang = "ar"): { ok: boolean; checks: MsgCheck[] } {
  const t = text.trim();
  const share = arabicShare(t);
  const langOk = t.length > 0 && (lang === "ar" ? share >= 0.6 : share <= 0.1);
  const hasHuman = HUMAN[lang].test(t);
  const hasChannel = CHANNEL.test(t.replace(PLACEHOLDER, ""));
  const checks: MsgCheck[] = [
    { id: "ai_disclosure", ok: DISCLOSURE[lang].test(t) && t.length > 0, detail: DISCLOSURE[lang].test(t) ? "The message says the citizen is dealing with an AI assistant." : "The message does not say the citizen is dealing with an AI assistant." },
    {
      id: "human_route",
      ok: hasHuman && hasChannel,
      detail: !hasHuman
        ? "No offer to reach a person."
        : !hasChannel
          ? "A person is mentioned but there is no phone, email or link (a [placeholder] does not count)."
          : "The message offers a way to reach a person.",
    },
    { id: "language", ok: langOk, detail: `Expected ${lang === "ar" ? "Arabic" : "English"}; ${Math.round(share * 100)}% of letters are Arabic.` },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

/** A starting draft with the three required elements. The contact is the
 * author's to fill in; the checker rejects the draft until they do. */
export function draftCitizenMessage(entity: string, contact: string, lang: MsgLang = "ar"): string {
  return lang === "ar"
    ? `مرحبًا، أنا مساعد ذكاء اصطناعي من ${entity}. قد تحتوي إجاباتي على أخطاء، ويراجعها موظف مختص عند الحاجة. للتحدث مع موظف بشري تواصل معنا على ${contact}.`
    : `Hello, I am an AI assistant from ${entity}. My answers may contain mistakes. To speak with a human staff member, contact us at ${contact}.`;
}
