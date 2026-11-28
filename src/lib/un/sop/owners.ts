// JOINT OWNERSHIP: an SOP task may be given to two roles ("Violations Officer and Field Inspector"). That is not a third job profile with a skill of its own: the task
// belongs to BOTH roles. One rule, used by profile derivation and by every skill builder, so they cannot disagree.
//
// A compound owner is split only when every part is itself the owner of other tasks in the same SOP. A real job title that contains "and" ("Research and Development Officer")
// owns tasks only under that whole name, so it is left alone. Pure: no I/O.

export const splitOwners = (who: string): string[] => who.split(/\s+and\s+|\s*\/\s*|\s*,\s*(?:and\s+)?/i).map((s) => s.trim()).filter(Boolean);

/** The known owner a part of a compound name stands for, or null. A part may carry a note in brackets ("Duty Officer (Level 2)") or be the short form of a longer title ("Duty Officer"
 * for "Operations Control Duty Officer"): it resolves to the owner it equals once the note is dropped, else to the ONE owner whose title ends with it. Two candidates resolve to none. */
function resolveOwner(part: string, known: string[]): string | null {
  const clean = part.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
  if (!clean) return null;
  const exact = known.filter((k) => k.toLowerCase() === clean || k.toLowerCase() === part.trim().toLowerCase());
  if (exact.length === 1) return exact[0];
  const tail = known.filter((k) => k.toLowerCase().endsWith(" " + clean));
  return exact.length === 0 && tail.length === 1 ? tail[0] : null;
}

/** The roles a task is owned by, given every owner name the SOP uses: the roles the parts of a compound owner stand for when EVERY part resolves to another owner, else the name as written. */
export function ownersOfTask(who: string, allOwners: Iterable<string>): string[] {
  const parts = splitOwners(who);
  if (parts.length < 2) return [who.trim()];
  const known = [...new Set([...allOwners].map((o) => o.trim()).filter((o) => o && o.toLowerCase() !== who.trim().toLowerCase()))];
  const resolved = parts.map((p) => resolveOwner(p, known));
  return resolved.every((r): r is string => !!r) ? [...new Set(resolved)] : [who.trim()];
}

/** Is this task (its owner as written) one of this profile's? */
export const ownedBy = (who: string | null, profile: string, allOwners: Iterable<string>): boolean =>
  !!who && ownersOfTask(who, allOwners).some((o) => o.toLowerCase() === profile.trim().toLowerCase());
