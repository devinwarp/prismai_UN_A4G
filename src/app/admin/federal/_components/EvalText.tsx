"use client";

import { tr } from "@/lib/un/i18n/dict";
import type { Finding } from "@/lib/un/grade";
import { SUBJECT_RULES, type SubjectRule } from "@/lib/un/subject";
import { useLang } from "./Lang";

// Small text helpers for the agent-lifecycle screens: pieces that need the language inside a
// sentence (a finding with its figures, a rule's text, a case's title). Client side, so they can
// read the language; the pages around them stay server components.

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, n: string) => String(v[n] ?? ""));

const FINDING_EN: Record<NonNullable<Finding["code"]>, string> = {
  contradicts_record: "Stated {key} = {value}; the record says {record}",
  not_in_record: "Stated {key} = {value}, which is not in the record",
  rejected_call: "Sijil rejected {tool} ({reason})",
  no_disclosure: "The citizen was not told they are talking to an AI assistant",
  missing_fact: "Did not state {key} (expected {value})",
  should_hand_over: "The fact is not in the record; the agent should have passed it to an officer",
};

/** A grader finding in the reader's language. Findings stored before they carried a code show their English sentence. */
export function FindingText({ f }: { f: Finding }) {
  const lang = useLang();
  if (!f.code) return <>{f.detail}</>;
  const v: Record<string, string | number> = { ...f.params };
  if (f.code === "rejected_call") v.reason = tr(lang, `ev.reason.${v.reason}`, String(v.reason).replace(/_/g, " "));
  return <>{fill(tr(lang, `ev.f.${f.code}`, FINDING_EN[f.code]), v)}</>;
}

export function ReasonText({ reason }: { reason: string }) {
  return <>{tr(useLang(), `ev.reason.${reason}`, reason.replace(/_/g, " "))}</>;
}

/** The text of an agent rule. */
export function RuleText({ rule }: { rule: SubjectRule }) {
  return <>{tr(useLang(), `rule.${rule}`, SUBJECT_RULES[rule])}</>;
}

/** An eval case's title or request; falls back to the English fixture. */
export function CaseText({ id, field, en }: { id: string; field: "title" | "request"; en: string }) {
  return <>{tr(useLang(), `case.${id}.${field}`, en)}</>;
}

/** A sentence with a rule's text inside it: {rule} is replaced by the translated rule. */
export function RuleSentence({ k, en, rule, v = {} }: { k: string; en: string; rule: SubjectRule; v?: Record<string, string | number> }) {
  const lang = useLang();
  return <>{fill(tr(lang, k, en), { ...v, rule: tr(lang, `rule.${rule}`, SUBJECT_RULES[rule]) })}</>;
}
