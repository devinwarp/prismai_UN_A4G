// First-party event hook. Logs in dev; sends nothing unless an endpoint is
// set explicitly (NEXT_PUBLIC_TRACK_URL). No third-party scripts, no cookies.
export function track(event: string, props: Record<string, string | number | boolean> = {}) {
  if (process.env.NODE_ENV !== "production") console.debug("[track]", event, props);
  const url = process.env.NEXT_PUBLIC_TRACK_URL;
  if (!url || typeof navigator === "undefined" || !navigator.sendBeacon) return;
  try {
    navigator.sendBeacon(url, JSON.stringify({ event, props, path: location.pathname, t: Date.now() }));
  } catch {}
}
