"use client";

import { Fragment, type ReactNode } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { T, useLang } from "./Lang";

// Small translated pieces shared by the compare, gaps, kb, country, gates and outside screens.
// Technical ids fall back to themselves, so English output is unchanged.

/** A shipped gate's short name (admin-added gates have no key and show their id). */
export const Gx = ({ id }: { id: string }) => <T k={`ub.gs.${id}`} en={id} />;
/** A rule set by id (uae-federal, eu-ai-act, sg-imda). */
export const Rs = ({ id, en }: { id: string; en?: string }) => <T k={`ub.rs.${id}`} en={en ?? id} />;
/** A role id (compliance, security, ...). */
export const Role = ({ id }: { id: string }) => <T k={`ub.role.${id}`} en={id} />;
/** A country by id (UAE, EU, SG). */
export const Ct = ({ id, en }: { id: string; en: string }) => <T k={`ub.ctry.${id}`} en={en} />;
/** A verdict id (GO_SUPERVISED, ...). */
export const Vd = ({ v, sp }: { v: string; sp?: boolean }) => <T k={`verdict.${v}`} en={sp ? v.replace("_", " ") : v} />;
/** A process flag: client_facing, affects_rights, irreversible. */
export const Flag = ({ id }: { id: string }) => (
  id === "client_facing" ? <T k="pf.cf" en={id} /> : id === "affects_rights" ? <T k="pf.ra" en={id} /> : id === "irreversible" ? <T k="pf.ir" en={id} /> : <>{id}</>
);
/** English-source text (policy, legal, our data files) kept left-to-right inside an Arabic page. */
export const En = ({ children }: { children: ReactNode }) => <bdi dir="ltr" lang="en">{children}</bdi>;
/** Ids, numbers, hashes and dates inside Arabic text. */
export const Ltr = ({ children }: { children: ReactNode }) => <bdi dir="ltr">{children}</bdi>;
/** Rendered only in Arabic: notices that would be redundant in English. */
export function ArOnly({ children }: { children: ReactNode }) {
  return useLang() === "ar" ? <>{children}</> : null;
}
/** Like TV, but the values may be elements; numbers are isolated as left-to-right. */
export function TX({ k, en, v }: { k: string; en: string; v: Record<string, ReactNode> }) {
  const parts = tr(useLang(), k, en).split(/\{(\w+)\}/);
  return <>{parts.map((p, i) => (i % 2 === 0 ? p : <Fragment key={i}>{typeof v[p] === "number" ? <Ltr>{v[p]}</Ltr> : v[p]}</Fragment>))}</>;
}
/** A list of gate ids as short names, comma separated; "none" when empty. */
export function GateList({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <T k="ub.none" en="none" />;
  return <>{ids.map((g, i) => <Fragment key={g}>{i > 0 && <T k="ub.comma" en=", " />}<Gx id={g} /></Fragment>)}</>;
}
