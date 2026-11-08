import Link from "next/link";
import DevDbBanner from "@/components/DevDbBanner";
import PrismMark from "@/components/PrismMark";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export default function AdminHeader({
  active,
  orgName,
  viewer,
}: {
  active: "federal";
  orgName?: string | null;
  /** Read-only member — hide admin nav;. */
  viewer?: boolean;
}) {
  // The switcher sits outside <header>: backdrop-blur makes the header the
  // containing block for fixed children, which pinned it over "Sign out".
  return (
    <>
      <header className="safe-top border-b border-line bg-paper/80 backdrop-blur">
        <DevDbBanner />
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            <PrismMark />
            {/* Wordmark hides at phone width so the nav never meets the logo. */}
            <span className="hidden font-mono text-sm tracking-widest uppercase sm:inline">
              Prism
            </span>
            {orgName && (
              <span
                className="ml-1 hidden max-w-40 truncate rounded-full border border-lit/50 bg-lit-soft/40 px-2 py-0.5 font-mono text-[10px] tracking-widest text-lit-deep uppercase sm:inline-block"
                title={orgName}
              >
                {orgName}
              </span>
            )}
          </div>
          <nav
            aria-label="Admin"
            className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[13px] sm:gap-x-4 sm:text-sm"
          >
            {!viewer && (
              <>
                <Link
                  href="/admin/federal"
                  aria-current={active === "federal" ? "page" : undefined}
                  className={
                    active === "federal"
                      ? "font-medium text-ink"
                      : "text-ink-soft hover:text-ink"
                  }
                >
                  Federal
                </Link>
              </>
            )}
            <form action="/auth/signout" method="post">
              <button className="text-ink-soft hover:text-ink">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <ThemeSwitcher />
    </>
  );
}
