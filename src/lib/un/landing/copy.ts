import type { Lang } from "../i18n/dict.ts";

// Landing page words. Every number here is from docs/eval/agent-results.md,
// docs/eval/agent-results-before-guard.md or the README (checked by tests/un-landing.test.ts).
// Arabic is a draft for review by a native speaker.
export const REPO = "https://github.com/devinwarp/prismai_UN_A4G";
export const REPORT = `${REPO}/blob/main/docs/report/prism-technical-report.pdf`;

const en = {
  brand: "Prism",
  skip: "Skip to content",
  headline: "Know when a government AI helper is safe to switch on, and prove it.",
  sub: "Prism checks an AI service against the rules, gives a plain answer (run on its own, run with a person watching, or do not run), and signs that answer in a logbook nobody can quietly edit.",
  cta: "Enter the live demo (read-only)",
  ctaSignedIn: "Open dashboard",
  ctaSecondary: "Watch how it decides",
  ctaNote: "One click. No sign-up. Synthetic data only.",
  close: "Close",
  navEvidence: "Evidence",
  signIn: "Sign in",
  doorsAria: "Choose how to start",
  doorDemoTitle: "Try the live demo",
  doorDemoBody: "For visitors and judges. Read-only, one click, synthetic data only.",
  doorSignTitle: "Sign in",
  doorSignBody: "For people in a government entity. Open your workspace and your use cases.",
  doorEvTitle: "See the evidence",
  doorEvBody: "For regulators and reviewers. What we measured, and what went wrong first.",
  doorEvCta: "Read the evidence",
  doorDashBody: "You are signed in. Pick up where you left off.",
  doorReplayBody: "A recorded run of a real decision. No sign-in needed.",
  doorReplayCta: "Watch the replay",
  chainStrip: "Six sealed records. Try to tamper with one.",
  stickyCta: "Enter the live demo",
  logTitle: "A real logbook. Try to cheat it.",
  logHint: "Six records, chained with SHA-256 in your browser. Change any word below.",
  logTamper: "Tamper with record 3 for me",
  logRestore: "Restore the original",
  logSealed: "Sealed",
  logEdited: "Edited",
  logBroken: "Link broken",
  logOk: "All six records match the signed seal.",
  logBad: (n: number) => `Record ${n} was changed, so it and every record after it no longer match the signed seal. The edit shows.`,
  logAria: (n: number) => `Record ${n}, editable`,
  logHash: "hash",
  records: [
    "Use case registered: visa renewal assistant",
    "Check passed: runs on approved infrastructure",
    "Check failed: no person approves messages to citizens",
    "Fix declared: a clerk now approves every message",
    "Decision: run with a person watching",
    "Signed by the reviewing officer",
  ],
  tamperFrom: "failed",
  tamperTo: "passed",

  proofTitle: "What we measured, and what went wrong first",
  proof: [
    ["60 of 60", "test runs reached the outcome the rules require (20 runs in each of three scenarios).", "Measured in recorded test runs: the system ran each scenario 20 times and compared every step with the outcome the rules require."],
    ["930 of 930", "sources the AI cited are real passages in our library. None were made up.", "Checked automatically in the same test runs: every cited passage was looked up in our library, which confirms it exists."],
    ["40 sources, 457 passages", "from official documents, each stored with a SHA-256 fingerprint.", "Counted directly from the library the system searches, not estimated."],
    ["20", "government use cases checked against the same rules.", "The synthetic use cases loaded in the demo. The system applies the same rules to each one."],
  ] as [string, string, string][],
  proofHonest:
    "Our first version failed. When the AI could change the answer, one scenario got the right outcome in 0 of 20 runs and another in 7 of 20. So we took that power away: the rules decide, and the AI may only add notes. Same test, then 60 of 60.",
  proofHow: "How this was measured",
  proofHonestLink: "Read the evaluation",

  howTitle: "How it works",
  how: [
    ["Check", "Nine plain rules are tested against evidence: where the service runs, whether every action is logged, whether a person approves what citizens see, and more."],
    ["Decide", "A fixed rule engine, not a language model, turns the results into one answer. Every reason points to a passage in an official source."],
    ["Sign", "The answer is written to the tamper-proof logbook and signed by a person. Anyone can re-check the chain later."],
  ] as [string, string][],

  sameTitle: "Same rules, different services",
  sameBody:
    "A visa assistant, a licence assistant and a benefits assistant are held to the same nine rules. Each still gets its own answer and its own reasons, so a regulator can compare them side by side.",
  rules: [
    "Runs on approved infrastructure",
    "Every action is logged",
    "Data is lawful for this purpose",
    "A person approves what reaches citizens",
    "Citizens are told it is an AI",
    "Mistakes stay under the agreed limit",
    "Fees match the published schedule",
    "No paid product promotion",
    "Data is used only for its purpose",
  ],

  whoTitle: "Who it is for",
  who: [
    ["Regulators and policy teams", "See which services are ready for more automation, and why."],
    ["Government entities", "Know what to fix before switching an AI helper on."],
    ["Citizens", "Are told it is an AI and always have a route to a person."],
  ] as [string, string][],

  faqTitle: "Questions people ask",
  faq: [
    ["Is a language model making the decision?", "No. A fixed rule engine decides. A language model can add notes and evidence, but it cannot change the answer. We tested that: 60 of 60 runs."],
    ["Is the data real?", "No. Everything in the demo is synthetic and labelled that way. No real citizen or agency data is used."],
    ["Can I break anything in the demo?", "No. The judge account is read-only. Every action that changes data is refused."],
    ["Who owns Sijil, the signing service?", "Sijil is our own attestation service. In this demo it is simulated."],
    ["Is it open source?", "Yes, under AGPL-3.0. The code, the evaluation and the technical report are public."],
  ] as [string, string][],

  trustTitle: "Built on public standards",
  trust:
    "Prism follows ITU-T Y.3172, the machine-learning architecture for future networks, and maps its checks to ITU's AI Readiness framework. This is an independent hackathon project. ITU and TDRA have not endorsed it.",

  finalTitle: "See it decide in under a minute.",
  footer: {
    report: "Technical report",
    code: "Source code",
    replay: "Replay",
    signin: "Sign in",
    note: "Hackathon entry. Synthetic data. AGPL-3.0.",
  },
  langSwitch: "العربية",
  langAria: "Switch to Arabic",
  themeAria: "Color theme",
};

export type Copy = typeof en;

const ar: Copy = {
  brand: "بريزم",
  skip: "انتقل إلى المحتوى",
  headline: "اعرف متى يكون مساعد الذكاء الاصطناعي الحكومي آمنًا للتشغيل، وأثبت ذلك.",
  sub: "يفحص بريزم خدمة الذكاء الاصطناعي وفق القواعد، ويعطي جوابًا واضحًا (تشغيل مستقل، أو تشغيل بإشراف شخص، أو عدم التشغيل)، ويوقّعه في سجل لا يمكن لأحد تعديله خفية.",
  cta: "ادخل إلى العرض المباشر (للقراءة فقط)",
  ctaSignedIn: "افتح لوحة المتابعة",
  ctaSecondary: "شاهد كيف يقرر",
  ctaNote: "نقرة واحدة. بلا تسجيل. بيانات اصطناعية فقط.",
  close: "إغلاق",
  navEvidence: "الأدلة",
  signIn: "تسجيل الدخول",
  doorsAria: "اختر كيف تبدأ",
  doorDemoTitle: "جرّب العرض المباشر",
  doorDemoBody: "للزوار والمحكّمين. للقراءة فقط، بنقرة واحدة، وببيانات اصطناعية فقط.",
  doorSignTitle: "تسجيل الدخول",
  doorSignBody: "لمن يعمل في جهة حكومية. افتح مساحة عملك وحالات الاستخدام.",
  doorEvTitle: "اطّلع على الأدلة",
  doorEvBody: "للجهات التنظيمية والمراجعين. ما قسناه، وما فشل في البداية.",
  doorEvCta: "اقرأ الأدلة",
  doorDashBody: "أنت مسجّل الدخول. تابع من حيث توقفت.",
  doorReplayBody: "تشغيل مسجَّل لقرار حقيقي. لا حاجة إلى تسجيل الدخول.",
  doorReplayCta: "شاهد الإعادة",
  chainStrip: "ستة سجلات مختومة. حاول التلاعب بأحدها.",
  stickyCta: "ادخل إلى العرض المباشر",
  logTitle: "سجل حقيقي. حاول التلاعب به.",
  logHint: "ست سجلات مترابطة بخوارزمية SHA-256 داخل متصفحك. غيّر أي كلمة أدناه.",
  logTamper: "عبث بالسجل 3 نيابةً عني",
  logRestore: "استعد الأصل",
  logSealed: "مختوم",
  logEdited: "معدَّل",
  logBroken: "الرابط مكسور",
  logOk: "السجلات الستة كلها مطابقة للختم الموقَّع.",
  logBad: (n: number) => `تم تغيير السجل ${n}، فلم يعد هو وكل ما بعده مطابقًا للختم الموقَّع. التعديل ظاهر.`,
  logAria: (n: number) => `السجل ${n}، قابل للتعديل`,
  logHash: "البصمة",
  records: [
    "تسجيل حالة الاستخدام: مساعد تجديد التأشيرات",
    "اجتاز الفحص: يعمل على بنية تحتية معتمدة",
    "أخفق الفحص: لا يوافق شخص على الرسائل الموجهة للمواطنين",
    "أُعلن عن إصلاح: موظف يوافق الآن على كل رسالة",
    "القرار: يعمل بإشراف شخص",
    "وقّعه الموظف المراجع",
  ],
  tamperFrom: "أخفق",
  tamperTo: "اجتاز",

  proofTitle: "ما قسناه، وما فشل في البداية",
  proof: [
    ["60 من 60", "تشغيلًا اختباريًا وصل إلى النتيجة التي تفرضها القواعد (20 تشغيلًا في كل من ثلاثة سيناريوهات).", "قِيست في تشغيلات اختبار مسجَّلة: شغّل النظام كل سيناريو 20 مرة وقارن كل خطوة بالنتيجة التي تفرضها القواعد."],
    ["930 من 930", "مصدرًا استشهد به الذكاء الاصطناعي هي مقاطع حقيقية في مكتبتنا. لا شيء منها مختلق.", "يفحصها النظام تلقائيًا في تشغيلات الاختبار نفسها: يُبحث عن كل مقطع مستشهَد به في مكتبتنا للتأكد من وجوده."],
    ["40 مصدرًا، 457 مقطعًا", "من وثائق رسمية، لكل منها بصمة SHA-256.", "معدودة مباشرة من المكتبة التي يبحث فيها النظام، وليست تقديرًا."],
    ["20", "حالة استخدام حكومية فُحصت وفق القواعد نفسها.", "حالات الاستخدام الاصطناعية المحمّلة في العرض. يطبّق النظام القواعد نفسها على كل منها."],
  ],
  proofHonest:
    "نسختنا الأولى أخفقت. حين كان الذكاء الاصطناعي قادرًا على تغيير الجواب، وصل سيناريو إلى النتيجة الصحيحة في 0 من 20 تشغيلًا وآخر في 7 من 20. فسحبنا منه هذه الصلاحية: القواعد تقرر، والذكاء الاصطناعي يضيف ملاحظات فقط. الاختبار نفسه، ثم 60 من 60.",
  proofHow: "كيف قِيس هذا",
  proofHonestLink: "اقرأ التقييم",

  howTitle: "كيف يعمل",
  how: [
    ["افحص", "تُختبر تسع قواعد واضحة مقابل الأدلة: أين تعمل الخدمة، وهل يُسجَّل كل إجراء، وهل يوافق شخص على ما يراه المواطن، وغير ذلك."],
    ["قرّر", "محرك قواعد ثابت، لا نموذج لغوي، يحوّل النتائج إلى جواب واحد. كل سبب يشير إلى مقطع من مصدر رسمي."],
    ["وقّع", "يُكتب الجواب في السجل المحصّن ضد التلاعب ويوقّعه شخص. يمكن لأي أحد إعادة فحص السلسلة لاحقًا."],
  ],

  sameTitle: "القواعد نفسها، خدمات مختلفة",
  sameBody:
    "مساعد التأشيرات ومساعد التراخيص ومساعد الإعانات تخضع جميعها للقواعد التسع نفسها. ومع ذلك تحصل كل خدمة على جوابها وأسبابها، ليقارن الجهة التنظيمية بينها جنبًا إلى جنب.",
  rules: [
    "تعمل على بنية تحتية معتمدة",
    "يُسجَّل كل إجراء",
    "البيانات قانونية الاستخدام لهذا الغرض",
    "يوافق شخص على ما يصل إلى المواطن",
    "يُبلَّغ المواطن بأنه يتعامل مع ذكاء اصطناعي",
    "الأخطاء ضمن الحد المتفق عليه",
    "الرسوم مطابقة للجدول المنشور",
    "لا ترويج لمنتجات مدفوعة",
    "تُستخدم البيانات لغرضها فقط",
  ],

  whoTitle: "لمن هو",
  who: [
    ["الجهات التنظيمية وفرق السياسات", "اعرف أي الخدمات جاهزة لمزيد من الأتمتة، ولماذا."],
    ["الجهات الحكومية", "اعرف ما يجب إصلاحه قبل تشغيل مساعد ذكاء اصطناعي."],
    ["المواطنون", "يُبلَّغون بأنه ذكاء اصطناعي ولديهم دائمًا طريق إلى شخص."],
  ],

  faqTitle: "أسئلة يطرحها الناس",
  faq: [
    ["هل يتخذ نموذج لغوي القرار؟", "لا. محرك قواعد ثابت هو الذي يقرر. يستطيع النموذج اللغوي إضافة ملاحظات وأدلة، لكنه لا يغيّر الجواب. اختبرنا ذلك: 60 من 60 تشغيلًا."],
    ["هل البيانات حقيقية؟", "لا. كل ما في العرض اصطناعي ومعنون بذلك. لا تُستخدم بيانات حقيقية لمواطنين أو جهات."],
    ["هل يمكنني إفساد شيء في العرض؟", "لا. حساب المحكّم للقراءة فقط، وكل إجراء يغيّر البيانات مرفوض."],
    ["من يملك «سجل»، خدمة التوقيع؟", "«سجل» خدمة التصديق الخاصة بنا. وهي في هذا العرض محاكاة."],
    ["هل هو مفتوح المصدر؟", "نعم، برخصة AGPL-3.0. الشيفرة والتقييم والتقرير التقني متاحة للعموم."],
  ],

  trustTitle: "مبني على معايير عامة",
  trust:
    "يتبع بريزم المعيار ITU-T Y.3172 (بنية التعلم الآلي للشبكات المستقبلية) ويربط فحوصه بإطار جاهزية الذكاء الاصطناعي من الاتحاد الدولي للاتصالات. هذا مشروع مستقل في هاكاثون، ولم يعتمده الاتحاد الدولي للاتصالات ولا هيئة تنظيم الاتصالات والحكومة الرقمية.",

  finalTitle: "شاهده يقرر في أقل من دقيقة.",
  footer: {
    report: "التقرير التقني",
    code: "الشيفرة المصدرية",
    replay: "إعادة العرض",
    signin: "تسجيل الدخول",
    note: "مشاركة في هاكاثون. بيانات اصطناعية. AGPL-3.0.",
  },
  langSwitch: "English",
  langAria: "التبديل إلى الإنجليزية",
  themeAria: "سمة الألوان",
};

export const COPY: Record<Lang, Copy> = { en, ar };
