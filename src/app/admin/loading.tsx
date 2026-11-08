// Instant shell for every /admin route while its server loader runs.
export default function Loading() {
  return (
    <div className="conduit-bg min-h-dvh" aria-busy="true" aria-live="polite">
      <div className="h-[69px] border-b border-line bg-paper/80" />
      <main className="mx-auto max-w-6xl animate-pulse px-4 py-8 sm:px-6">
        <span className="sr-only">Loading…</span>
        <div className="h-3 w-24 rounded bg-line" />
        <div className="mt-3 h-9 w-72 rounded bg-line" />
        <div className="mt-6 h-20 rounded-2xl bg-line/60" />
        <div className="mt-6 h-64 rounded-2xl bg-line/60" />
      </main>
    </div>
  );
}
