// Arabic strings for the line that says where a pilot's Sijil figures came from. DRAFT translations for review by a native speaker,
// like the rest of dict.ts. Spread into AR there.
export const SIJIL_RUN_AR: Record<string, string> = {
  "sl.halted": "عقدة Sijil {id} متوقفة: خُتمت كل الاستدعاءات على أنها محجوبة ({n} سجلًا).",
  "sl.node.ok": "عقدة Sijil {id}: خُتم {n} سجلًا عبر {r} تشغيلًا، وسلسلة السجلات موثّقة.",
  "sl.node.bad": "عقدة Sijil {id}: خُتم {n} سجلًا عبر {r} تشغيلًا، وسلسلة السجلات غير موثّقة ({why}).",
  "sl.node.orphan": "عقدة Sijil {id}: خُتم {n} سجلًا عبر {r} تشغيلًا. لم يفحص مدقّق العقدة السلسلة، إذ يتوقف عند استدعاءات الأدوات التي لا يسبقها استدعاء نموذج مسجّل (استدعاءات النموذج لهذا الوكيل لا تمر عبر العقدة).",
  "sl.node.unk": "عقدة Sijil {id}: خُتم {n} سجلًا عبر {r} تشغيلًا.",
  "sl.partial": "استُخدمت عقدة Sijil في {k} من {r} تشغيلًا؛ وعاد الباقي إلى البوابة المحاكاة.",
  "sl.sim.note": "بوابة Sijil المحاكاة: {note}",
  "sl.sim.down": "بوابة Sijil المحاكاة: كانت عقدة Sijil مُعدّة لكن هذه التشغيلات استخدمت البوابة المحاكاة ({why}).",
  "sl.sim.none": "بوابة Sijil المحاكاة: لم تُستخدم أي عقدة Sijil في هذه التجربة؛ والاستدعاءات المرفوضة تأتي من فحص قائمة السماح في Prism نفسه.",
};
