// Who may approve a gate change. Pure: no I/O.
//
// Every gate change (a gate added to a use case, a waiver, a change to the gate catalogue) needs a named
// approver, and the approver is chosen from a list, never typed. The list comes from the org chart. The org
// chart is not built yet, so until it is the list is:
//   - for a use case with an SOP attached: the process owner (the "Owner" line in the SOP's document control)
//     first, which is the default, then the job titles of the SOP's job profiles;
//   - otherwise, and for changes to the org-wide gate catalogue (which belong to no single process): a short
//     configured list of governance roles.
// When the org chart exists, the list becomes the people who hold those titles and nothing else changes: the
// log already stores the title and where it came from.

export type ApproverSource = "process_owner" | "job_title" | "governance";

export interface Approver { title: string; source: ApproverSource }

/** Roles that may approve changes to the org-wide gate catalogue, or a use case with no SOP. A stand-in for the org chart. */
export const GOVERNANCE_APPROVERS: readonly string[] = ["Entity head", "Compliance lead", "Head of AI governance"];

export const governanceApprovers = (): Approver[] => GOVERNANCE_APPROVERS.map((title) => ({ title, source: "governance" as const }));

/** The process owner named in an SOP's document control table, as a job title: "Head of Licensing, Marsa Public
 * Services Authority" gives "Head of Licensing". Null when the SOP names no owner. */
export function processOwnerOf(sopText: string): string | null {
  const m = /^\|\s*Owner\s*\|\s*(.+?)\s*\|\s*$/m.exec(sopText.replace(/\r\n/g, "\n"));
  const title = m?.[1].split(",")[0].trim();
  // a document control table that says "Not stated in the source." (an SOP the structuring step wrote from text with no owner) names nobody
  return title && !/^not stated/i.test(title) ? title : null;
}

/** The approvers for a use case's gate changes: process owner first (the default), then the SOP's job titles,
 * without repeats. With no SOP attached, the governance list. */
export function approverOptions(o: { sopText?: string | null; profiles?: string[] }): Approver[] {
  const out: Approver[] = [];
  const seen = new Set<string>();
  const add = (title: string, source: ApproverSource) => {
    const k = title.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ title: title.trim(), source });
  };
  const owner = o.sopText ? processOwnerOf(o.sopText) : null;
  if (owner) add(owner, "process_owner");
  for (const p of o.profiles ?? []) add(p, "job_title");
  return out.length ? out : governanceApprovers();
}

/** The approvers for what the governance admin of the country signs off (process targets, test sets, verdict parameters): the use case's own list, plus the
 * governance roles, so the governance admin can always be named (their job title is "Head of AI governance"). */
export function withGovernance(list: Approver[]): Approver[] {
  const have = new Set(list.map((a) => a.title.trim().toLowerCase()));
  return [...list, ...governanceApprovers().filter((a) => !have.has(a.title.toLowerCase()))];
}

export type ApproverResult = { ok: true; approver: Approver } | { ok: false; error: string };

/** Checks a submitted approver against the allowed list. An empty choice falls back to the process owner when the
 * list has one; otherwise the admin must choose. A title that is not on the list is refused. */
export function resolveApprover(choice: unknown, options: Approver[], opts: { defaultToOwner?: boolean } = {}): ApproverResult {
  const wanted = typeof choice === "string" ? choice.trim() : "";
  if (!wanted) {
    const owner = opts.defaultToOwner === false ? undefined : options.find((a) => a.source === "process_owner");
    return owner ? { ok: true, approver: owner } : { ok: false, error: "Choose the approver from the list" };
  }
  const hit = options.find((a) => a.title.toLowerCase() === wanted.toLowerCase());
  return hit ? { ok: true, approver: hit } : { ok: false, error: "The approver must be chosen from the list" };
}

/** What goes into a gate-log entry for an approval. */
export const approvalFields = (a: Approver) => ({ approver: a.title, approver_source: a.source });
