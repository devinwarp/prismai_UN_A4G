/** Organisation administrators: the `admin` role and the platform (super) administrator. The permission layer already gives `platform` every role an `admin` has
 * (authz.ts LEGACY_ADMIN); pages and routes that test the stored role directly use this so the two never disagree. */
export const isOrgAdmin = (role: string | null | undefined): boolean => role === "admin" || role === "platform";
