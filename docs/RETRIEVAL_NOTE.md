# Retrieval note: vector and hybrid search results (updated 19 Nov 2026)

**Decision: the app still searches the knowledge base with BM25 (keyword search). Hybrid is built and stays off by default (`KB_VECTOR=on` to enable).** After re-embedding everything with real model output, hybrid ties BM25 on the tuning set and is not better on MRR, so the rule "on only if it beats BM25 on both sets" is not met. Details below. Nothing here is estimated: every number is printed by `npm run kb:score` and stored in `kb/eval/RESULTS.md`.

## How the vectors were made, and what is disclosed

- **Model: nomic-embed-text-v1.5 (768 dimensions), the model ITU's Ollama `nomic-embed-text` serves.** ITU's reference pipeline calls `embed_texts` against Ollama. Ollama was not available, and **we did not use ITU's `embed_texts`** for these vectors.
- **Server that ran: transformers.js** (`nomic-ai/nomic-embed-text-v1.5`, ONNX build, mean pooling, L2-normalised), via `node scripts/embed_kb.ts`. **LM Studio was not used.** The task asked for LM Studio's `text-embedding-nomic-embed-text-v1.5` on `localhost:1234`; the server answered, but it requires an API token (`Authorization: Bearer`) that was not provided to the build, so no request succeeded. `scripts/embed_kb.ts` supports it: set `LM_API_TOKEN` (and optionally `LM_STUDIO_URL`, `LM_EMBED_MODEL`) and re-run, which re-embeds with LM Studio and records `"backend": "lm-studio"` in the metadata. The numbers below would then need a re-run; a quantised GGUF build can differ slightly from the ONNX one.
- **Prefixes follow the model card:** chunks are embedded as `search_document: <text>`, queries as `search_query: <text>`. The earlier vectors had no document prefix and (for 33 + 30 + 16 + about 280 chunks) were copies, nearest-chunk reuse or the corpus mean, not model output. **All 398 chunk vectors and all 76 question vectors are now freshly computed model output.** That is why vector-only recall rose from 0.53 to 0.84.
- **Runtime queries are consistent with the documents:** `src/lib/un/vector.ts` embeds queries with the same transformers.js model and the `search_query: ` prefix, normalised, with the 8-second fallback to BM25. It is unchanged.
- **Metadata** is in `kb/vectors.json` under `meta` (model, backend, server model, date `2026-11-19`, prefixes, pooling) and in `kb/eval/query_vectors.json`.

## Knowledge base

32 sources and **398 chunks** (was 26 and 364 before 19 Nov). Added as short quoted excerpts (at most 40 words each; `THIRD_PARTY_NOTICES.md`, sixth step): GDPR Art. 22 (`gdpr-art22`), EU AI Act Art. 12 (`eu-ai-act-art12`), EU AI Act accessibility, inclusion and energy provisions (`eu-ai-act-inclusion-energy`), WCAG 2.2 (`w3c-wcag22`), the African Union Continental AI Strategy (`au-continental-ai-strategy`) and India's AI Governance Guidelines (`in-ai-governance-guidelines`). The EUR-Lex texts were read through a browser because EUR-Lex refuses scripted downloads; their `source_sha256` is the hash of the rendered page text, not of a file. They were added with `kb/sync_excerpts.py`, which needs no ITU repo; `kb/build.py` was not run (the ITU repo is not on this machine), so the other 26 sources' chunks are unchanged.

## Questions

76 questions: 44 English tuning, 22 English held-out, 6 + 4 Arabic. Gold chunks are those containing a verbatim anchor phrase from the source, chosen from the text and not from rankings. The 30 + 14 original questions are unchanged; 14 tuning and 8 held-out English and all Arabic questions were added on 19 Nov. All of them were written, with their anchors, before the new corpus was embedded or scored, and no setting was tuned after seeing results (BM25, fusion and chunking are exactly as before). The Arabic questions have gold in English chunks, so they test cross-lingual retrieval.

## Results

| Method | Tuning (44): recall@5 | MRR | Held-out (22): recall@5 | MRR |
|---|---|---|---|---|
| **BM25 (what the app uses)** | **0.91** | 0.843 | **0.86** | 0.818 |
| Vector only | 0.84 | 0.693 | 0.77 | 0.727 |
| Hybrid (BM25 + vector, RRF) | 0.91 | 0.805 | 0.91 | 0.784 |

Arabic (English corpus; 6 tuning, 4 held-out): BM25 0.00 / 0.000 and 0.00 / 0.000; vector 0.00 / 0.000 and 0.00 / 0.008; hybrid 0.00 / 0.000 and 0.00 / 0.008 (recall@5 / MRR).

Arabic with LLM query translation (same questions, queries translated to English first): BM25 1.00 / 0.917 and 1.00 / 1.000; vector 1.00 / 0.917 and 1.00 / 0.875; hybrid 1.00 / 0.917 and 1.00 / 1.000 (n = 6 and 4, so one miss is 17 or 25 points).

- **Why hybrid stays off.** It equals BM25 on recall@5 on the tuning set, is one question better on the held-out set (0.91 against 0.86; one question is 4.5 points on 22), and has a lower MRR on both. It does not beat BM25 on both sets, and it adds a model download and a cold start. Without the excerpt-chunk questions (`npm run kb:score -- --no-excerpts`): BM25 0.90 and 0.84, hybrid 0.90 and 0.89 (40 and 19 questions), the same picture.
- **Arabic works only through translation.** Untranslated, Arabic scores 0 on every method: the BM25 tokenizer produces no Arabic tokens, the corpus is English, and nomic v1.5 is English-centred. Retrieval therefore translates an Arabic query to English with the LLM first (`src/lib/un/query-translate.ts`, 6 s timeout, in-memory cache, falls back to the original query, flagged `query_translated_from: "ar"` in the KB API). This is a dependency on a model, not native Arabic retrieval; if the model is down, Arabic search returns nothing useful. The eval uses translations cached in `kb/eval/ar-translations.json` (made by `scripts/translate_eval_ar.ts`, vectors under `<id>:en` in `query_vectors.json`), so scoring is offline. Only 10 questions, written as paraphrases of English ones, so 1.00 is an upper-leaning estimate; a multilingual embedding model would be needed for native support.
- **Caution.** Small sets: one question is 2 points on 44 and 4.5 on 22. Several questions have their answer in a short excerpt chunk, which ranks easily. The plan's hybrid target of 0.85 on the tuning set is met numerically (0.91), but not because hybrid beats BM25, so it is not used as a reason to switch it on.
- The chunk-size, per-source-cap, prefix and fusion-weight grid in `kb/eval/EXPERIMENTS.md` was measured earlier on 281 chunks with approximate vectors and was not repeated.

## Switching hybrid on (only if you want it)

1. In the Vercel project, set `KB_VECTOR=on` and redeploy.
2. Signed in, open `/api/admin/un/kb?q=human+oversight+before+an+output+reaches+a+citizen&k=5` twice. The first call may download the model (cold start); the second should be fast.
3. `"vector": "on"` and an answer in a few seconds on the second call means it works. `"off"`, an error, or a first call over about 10 seconds means leave it off.
4. To go back, remove `KB_VECTOR` and redeploy; nothing else depends on it.

Do not describe hybrid search as live unless step 3 passed. The round-two report (docs/report) quotes the figures in `kb/eval/RESULTS.md`.
