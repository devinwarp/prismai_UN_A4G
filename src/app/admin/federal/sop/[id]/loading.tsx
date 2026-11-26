import LangShell, { T } from "../../_components/Lang";
import { card } from "../../_components/ui";

export default function SopReaderLoading() {
  return (
    <div className="conduit-bg min-h-dvh">
      <LangShell bare>
        <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
          <p role="status" className={`${card} font-display text-xl font-medium`}>
            <T k="pf.sop.opening" en="Opening SOP…" />
          </p>
        </main>
      </LangShell>
    </div>
  );
}
