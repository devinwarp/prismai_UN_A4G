import { VERDICTS } from "../model.ts";
import { GATES } from "../policy.ts";

// Lightweight Arabic/English dictionary for the federal admin UI. Pure, no
// library. Keys not found fall back to the English text passed by the caller,
// so untranslated screens degrade to English instead of breaking. Technical
// ids (run ids, trace ids, hashes, GO_SUPERVISED in the title attribute) are
// not translated.
export type Lang = "en" | "ar";
export const DIR: Record<Lang, "ltr" | "rtl"> = { en: "ltr", ar: "rtl" };

/** Arabic strings are draft translations for review by a native speaker. */
export const AR: Record<string, string> = {
  "compare.title": "العمليات الحكومية ضمن سياسة واحدة",
  "compare.policy": "طبقة السياسة (هدف الدولة وقواعدها)",
  // verdicts (five-step scale)
  "verdict.GO_AUTONOMOUS": "مسموح بالتشغيل المستقل",
  "verdict.GO_SUPERVISED": "مسموح مع إشراف بشري",
  "verdict.ASSISTANT_ONLY": "مساعد فقط",
  "verdict.NO_GO": "غير مسموح",
  "verdict.ESCALATE": "تصعيد",
  "verdict.NONE": "لا يوجد قرار",
  // gate statuses
  "status.pass": "اجتاز",
  "status.fail": "أخفق",
  "status.fix_declared": "أُعلن عن إصلاح",
  "status.unknown": "لا توجد أدلة",
  // gates
  "gate.approved_infrastructure": "نماذج وبيانات على بنية تحتية معتمدة",
  "gate.audit_log": "تسجيل كل إجراء في سجل التدقيق",
  "gate.data_lawful": "البيانات قانونية الاستخدام لهذا الغرض",
  "gate.human_final_approval": "موافقة نهائية من شخص قبل وصول أي مخرجات إلى المواطن",
  "gate.ai_disclosure": "إبلاغ المواطن بأنه يتعامل مع مساعد ذكاء اصطناعي",
  "gate.hallucination_rate": "معدل الهلوسة ضمن الحد المتفق عليه",
  "gate.fee_accuracy": "الرسوم المعلنة مطابقة لجدول الرسوم المنشور",
  "gate.no_commercial_promotion": "عدم الترويج لمنتجات تجارية مدفوعة",
  "gate.purpose_limitation": "تقييد استخدام البيانات بالغرض المحدد",
  // federal panel navigation and headings
  "nav.progress": "التقدم",
  "nav.portfolio": "المحفظة",
  "nav.use-cases": "حالات الاستخدام",
  "nav.policy": "السياسة",
  "nav.import": "استيراد",
  "nav.hitl": "قواعد الإشراف",
  "page.federal": "لوحة المتابعة الاتحادية",
  // run viewer
  "run.all_scenarios": "كل السيناريوهات",
  "run.release_first": "إطلاق الخطوة الأولى",
  "run.release_next": "إطلاق الخطوة التالية",
  "run.sign": "توقيع",
  "run.withhold": "حجب الموافقة",
  "meter.title": "قياس التشغيل",
  "meter.estimated": "تقديري",
  "meter.tokens": "الرموز",
  "meter.seconds": "الثواني",
  "meter.energy": "الطاقة (تقدير)",
  // citizen message check
  "msg.title": "فحص رسالة المواطن",
  "msg.draft": "إنشاء مسودة",
  "msg.check": "فحص",
  "msg.pass": "اجتازت الفحوص",
  "msg.fail": "لم تجتز الفحوص",
};

/** Look up a key; fall back to the English text supplied at the call site. */
export const tr = (lang: Lang, key: string, en: string): string => (lang === "ar" ? AR[key] ?? en : en);

export const verdictKeys = () => VERDICTS.map((v) => `verdict.${v}`);
export const gateKeys = () => Object.keys(GATES).map((g) => `gate.${g}`);
