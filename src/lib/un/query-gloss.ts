// Offline fallback for Arabic search queries when the LLM translator is unavailable: a small
// glossary of policy vocabulary (Arabic phrase -> English terms) matched longest-first, the
// rest of the sentence dropped. It is a bag of English keywords for BM25, not a translation,
// and it covers only the terms below (no dialects, no spelling variants beyond the normalisation).
const GLOSSARY: [string, string][] = [
  ["الذكاء الاصطناعي الوكيل", "agentic AI"], ["الذكاء الاصطناعي", "artificial intelligence"],
  ["الاشراف البشري", "human oversight"], ["موافقة بشرية", "human approval"], ["سجل التدقيق", "audit log"], ["التدقيق", "audit"],
  ["حماية البيانات", "data protection"], ["البيانات الشخصية", "personal data"], ["صاحب البيانات", "data subject"], ["نقل البيانات", "transfer of data"],
  ["الى الخارج", "abroad third country"], ["عبر الحدود", "cross-border"], ["المعالجة الالية", "automated processing decision"],
  ["القرارات", "decision"], ["الموافقة", "consent"], ["التظلم", "grievance redress complaint"], ["الشكوى", "complaint"], ["الاستئناف", "appeal"],
  ["الشفافية", "transparency"], ["الافصاح", "disclosure"], ["عالية المخاطر", "high-risk"], ["المخاطر", "risk"], ["الخصوصية", "privacy"], ["الامن", "security"],
  ["المساءلة", "accountability"], ["التحيز", "bias"], ["الهلوسة", "hallucination"], ["الرسوم", "fees"], ["رسوم", "fee"], ["دفع", "pay"], ["الغرامات", "fines"],
  ["الحقوق", "rights"], ["حقوق", "rights"], ["الاتحاد الاوروبي", "European Union"], ["الاتحاد الافريقي", "African Union"],
  ["الامارات", "UAE"], ["الاماراتي", "UAE"], ["سنغافورة", "Singapore"], ["الهند", "India"], ["الاوروبي", "EU"],
  ["قانون", "law act"], ["استراتيجية", "strategy"], ["ميثاق", "charter"], ["الوكيل", "agent"], ["الوكلاء", "agents"], ["مزودي", "providers"], ["مزود", "provider"],
  ["استهلاك الطاقة", "energy consumption"], ["النموذج", "model"], ["السجلات", "logs records"], ["المواطن", "citizen"], ["الحكومية", "government"], ["القطاعات", "sectors"],
  ["النسبة المستهدفة", "target percentage"], ["التقييم", "assessment"], ["الجهة المختصة", "authority"], ["المستندات", "documents"], ["الوثائق", "documents"], ["الاوراق", "documents"], ["التجديد", "renewal"], ["تجديد", "renewal"], ["المطلوبه", "required"], ["المطلوب", "required"], ["مطلوب", "required"], ["مطلوبه", "required"], ["الرخصه التجاريه", "trade licence"], ["الرخصة التجارية", "trade licence"], ["الدفع", "pay payment"], ["المتاخر", "late"], ["المتاخره", "late"], ["بالتقسيط", "instalments"], ["التقسيط", "instalments"], ["الاحتفاظ", "retention"], ["الاختراق", "breach"],
];

/** Strip diacritics and tatweel, fold alef/ya/ta-marbuta variants, and drop a leading و/ب/ل/ك/ف before a matched term. */
const fold = (s: string) =>
  s.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[؟،؛?.,;:()]/g, " ");

const ENTRIES = GLOSSARY.map(([ar, en]) => [fold(ar).replace(/ة/g, "ه"), en] as const).sort((a, b) => b[0].length - a[0].length);

/** English keywords for the glossary terms found in an Arabic query, or "" when none match. */
export function glossQuery(q: string): string {
  let rest = ` ${fold(q).replace(/\s+/g, " ")} `;
  const out: string[] = [];
  for (const [ar, en] of ENTRIES) {
    // a term stored with its "ال" also matches the elided "لل" (للتجديد = ل + التجديد) and one-letter prefixes (و ب ك ف)
    const body = ar.startsWith("ال") ? `(?:[وبكف]?ال|لل)${ar.slice(2)}` : `[وبلكف]?${ar}`;
    const re = new RegExp(`(?<=\\s)${body}(?=\\s)`, "u");
    const m = re.exec(rest);
    if (m) { out.push(en); rest = rest.replace(m[0], " "); }
  }
  return [...new Set(out.join(" ").split(" "))].join(" ");
}
