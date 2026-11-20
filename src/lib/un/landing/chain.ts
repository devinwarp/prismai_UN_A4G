// The landing page's mini logbook: a real SHA-256 hash chain, computed in the
// browser. Each record's hash covers the previous hash plus its own text.
export const GENESIS = "0".repeat(64);

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function chainHashes(texts: string[]): Promise<string[]> {
  const out: string[] = [];
  let prev = GENESIS;
  for (const t of texts) {
    prev = await sha256Hex(`${prev}|${t}`);
    out.push(prev);
  }
  return out;
}

/** Index of the first record whose live hash differs from the sealed one, or -1. */
export function firstBroken(sealed: string[], live: string[]): number {
  return live.findIndex((h, i) => h !== sealed[i]);
}
