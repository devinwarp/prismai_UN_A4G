// The five tabs of a use-case page and which route segment belongs to which. Pure: no I/O.
// The route segment alone decides the tab: a stage link (?stage=gates on /sop, ?stage=approval on /tuning) stays on its page's tab.

export type TabId = "overview" | "setup" | "pilot" | "tuning" | "production";
export const TABS: { id: TabId; href: string; segments: string[] }[] = [
  { id: "overview", href: "", segments: [] },
  { id: "setup", href: "/sop", segments: ["sop", "targets", "tests"] },
  { id: "pilot", href: "/pilot", segments: ["pilot", "evals"] },
  { id: "tuning", href: "/tuning", segments: ["tuning", "improve"] },
  { id: "production", href: "/production", segments: ["production"] },
];

export function tabFor(segment: string | null): TabId {
  return TABS.find((t) => segment !== null && t.segments.includes(segment))?.id ?? "overview";
}
