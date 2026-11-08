// Dev-only safety flag — this repo's .env.local points at the production
// Supabase project, so local testing mutates live data. Show an obvious
// banner on admin surfaces until a dedicated dev project exists.
export default function DevDbBanner() {
  if (process.env.NODE_ENV === "production") return null;
  let host = "unknown db";
  try {
    host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    // keep the fallback label
  }
  return (
    <div className="border-b border-ember/40 bg-ember/10 px-4 py-1.5 text-center font-mono text-[11px] tracking-wide text-ember">
      DEV — mutations go to {host}
    </div>
  );
}
