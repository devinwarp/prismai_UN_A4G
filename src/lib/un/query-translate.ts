// Arabic queries against an English corpus: translate to English with the LLM before
// retrieval. This is a dependency on a model, not native Arabic retrieval. Never throws:
// on timeout or error the original query is used and `from` stays undefined.
export const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

export type Translator = (q: string) => Promise<string>;

const cache = new Map<string, string>(); // ponytail: unbounded in-process map, fine for a demo server

async function llmTranslate(q: string): Promise<string> {
  const { chatCompletion } = await import("../llm.ts");
  return chatCompletion({
    system: "Translate the user's search query from Arabic to English. Reply with the English query only: no quotes, no commentary. Keep names of laws and institutions in their standard English form.",
    messages: [{ role: "user", content: q }],
    maxTokens: 200,
    timeoutMs: 6000,
    seed: 1,
  });
}

/** `{ query, from: "ar" }` when Arabic was translated; `{ query: original }` otherwise. */
export async function translateQuery(q: string, translate: Translator = llmTranslate): Promise<{ query: string; from?: "ar" }> {
  if (!hasArabic(q)) return { query: q };
  const hit = cache.get(q);
  if (hit) return { query: hit, from: "ar" };
  try {
    const en = (await translate(q)).trim().replace(/^["'“]|["'”]$/g, "");
    if (!en || hasArabic(en)) return { query: q };
    cache.set(q, en);
    return { query: en, from: "ar" };
  } catch {
    return { query: q };
  }
}
