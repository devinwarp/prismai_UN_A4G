import Link from "next/link";
import DevDbBanner from "@/components/DevDbBanner";
import PrismMark from "@/components/PrismMark";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import HeaderTools from "./HeaderTools";
import SignOut from "./SignOut";
import { FederalLabel, HeaderRow } from "./HeaderLang";

export default function AdminHeader({
  active,
  orgName,
  viewer,
  country,
  dense,
}: {
  active: "federal";
  orgName?: string | null;
  /** Read-only member — hide admin nav;. */
  viewer?: boolean;
  /** Show the country switch in the top right: the admin dashboard only. */
  country?: boolean;
  /** One-screen desktop dashboard: full width and a shorter bar (only at the `desk` size; phones keep the usual header). */
  dense?: boolean;
}) {
  // The switcher sits outside <header>: backdrop-blur makes the header the
  // containing block for fixed children, which pinned it over "Sign out".
  return (
    <>
      <header className="safe-top border-b border-line bg-paper/80 backdrop-blur">
        <DevDbBanner />
        <HeaderRow className={`mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 ${dense ? "desk:max-w-[120rem] desk:py-2" : ""}`}>
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            <PrismMark />
            {/* Wordmark hides at phone width so the nav never meets the logo. */}
            <span className="hidden font-mono text-sm tracking-widest uppercase sm:inline">
              Prism
            </span>
            {orgName && (
              <span
                className="ms-1 hidden max-w-40 truncate rounded-full border border-lit/50 bg-lit-soft/40 px-2 py-0.5 font-mono text-[10px] tracking-widest text-lit-deep uppercase sm:inline-block"
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
                  <FederalLabel />
                </Link>
              </>
            )}
            <HeaderTools country={country} />
            {/* One-screen desktop: the palette picker sits in the bar instead of floating over the corner of the register. */}
            {dense && <span className="hidden desk:inline-flex"><ThemeSwitcher variant="inline" /></span>}
            <form action="/auth/signout" method="post">
              <SignOut />
            </form>
          </nav>
        </HeaderRow>
      </header>
      {dense ? <div className="desk:hidden"><ThemeSwitcher /></div> : <ThemeSwitcher />}
    </>
  );
}
