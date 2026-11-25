import { NextResponse } from "next/server";
import { bad, caller, forbidden } from "@/lib/api-auth";
import { loadFederalReadAccess } from "@/lib/un/federal-read-access";
import { excerpt, loadChunks } from "@/lib/un/kb";
import { loadFederalCountry } from "@/lib/un/federal-country";
import { scopeOf } from "@/lib/un/country-actions";
import { translateQuery } from "@/lib/un/query-translate";
import { embedQuery, hybridSearch, loadVectors } from "@/lib/un/vector";

/** GET /api/admin/un/kb?q=…&k=5 → { vector: "on"|"off", hits }: chunk id, source, url, sha256, quote.
 * Mixed: best UAE/Dubai chunks beside the best global ones. Hybrid (BM25 + vector,
 * reciprocal rank fusion) when kb/vectors.json exists and the query embedder loads;
 * otherwise BM25 alone and vector is "off". BM25 is the default: vector search runs
 * only with KB_VECTOR=on, so it can be switched off again without a deploy-time change
 * to the code if the cold start is slow. */
export async function GET(request: Request) {
  const who = await caller();
  if (!who?.org_id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const access = await loadFederalReadAccess(who.org_id, who.id, who.role);
  if (!access.allCases) return forbidden("Federal knowledge base access is required.");
  const url = new URL(request.url);
  const asked = (url.searchParams.get("q") ?? "").trim();
  if (!asked) return bad("q is required");
  const selected = url.searchParams.get("country");
  const scope = selected ? await loadFederalCountry(who.org_id, selected, access.browseCountries) : null;
  const chunks = scope ? await scopeOf(scope.deps, scope.state, scope.country.id) : loadChunks();
  if (!chunks?.length) return NextResponse.json({ vector: "off", hits: [] });
  // Arabic queries are translated to English first (the corpus is English); falls back to the original.
  const { query: q, from, via } = await translateQuery(asked);
  const k = Math.min(10, Math.max(1, Number(url.searchParams.get("k")) || 5));
  const vectors = loadVectors(loadChunks());
  const found = hybridSearch(chunks, vectors, vectors ? await embedQuery(q) : null, q, { k, mix: !scope || scope.country.id === "UAE" });
  const hits = found.hits.map(({ chunk: c, score }) => ({
    chunk_id: c.chunk_id,
    score: Math.round(score * 1000) / 1000,
    source: c.title,
    issuer: c.issuer,
    jurisdiction: c.jurisdiction,
    url: c.url,
    sha256: c.sha256,
    quote: excerpt(c.text, q),
  }));
  return NextResponse.json({ vector: found.mode === "hybrid" ? "on" : "off", ...(from ? { query_translated_from: from, query_used: q, ...(via ? { query_translated_via: via } : {}) } : {}), hits });
}
