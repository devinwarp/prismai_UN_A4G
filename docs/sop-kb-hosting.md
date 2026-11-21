# SOP knowledge base: storage and embedding in a hosted app

Status: the SQL was applied to the hackathon Supabase project on 21 Nov 2026 (tables created, pgvector enabled, row-level security on), but the Supabase store is unit-tested only against a mocked client and the app has not been exercised with writes to these tables on the hosted database. The app defaults to the file store (`src/lib/un/kb-store.ts`), which is what runs offline and in the tests.

## What is stored
`supabase/un-sop-kb.sql` (a new file; `schema.sql` is untouched) adds `un_sops`, `un_sop_chunks` (with `embedding vector(768)`, an HNSW cosine index and `un_match_sop_chunks`), `un_kb_configs` (settings and rule-line versions), `un_kb_questions`, `un_kb_runs` and `un_kb_log` (hash-chained, append-only by trigger). The outside-request queue is another workstream's table and is not created here. Set `UN_KB_STORE=supabase` to use it once applied.

The retrieval used by the agent and the evals still reads `kb/sop/<id>/chunks.json` and `vectors.json`; the store holds a copy (seeded on first use). Pointing retrieval at the store (`un_match_sop_chunks`) is the next step.

## Embedding today and when hosted
Today embedding is a script: `scripts/build_sop_kb.ts` chunks the SOP and embeds each chunk with nomic-embed-text-v1.5 (768 dimensions, `search_document: ` prefix, normalised) through transformers.js or LM Studio. A hosted app cannot run that inside a request: the model download and CPU cost do not fit a serverless function, and query embedding (`search_query: ` prefix) has the same problem. Two workable shapes:

1. **Worker.** Uploading or editing an SOP inserts a job; a long-running worker (a container or a queue consumer) runs the same chunk and embed code, then calls `putChunks` with the vectors. Chunk `sha256` lets it skip unchanged chunks and lets the agent refuse stale vectors (`vectorStatus`).
2. **Hosted endpoint.** The same model behind an HTTP embeddings endpoint (LM Studio-compatible, or a model server). `build_sop_kb.ts` already supports `LM_STUDIO_URL` and `LM_API_TOKEN`; the app would call it for both documents and queries.

Either way the model, prefixes and normalisation must match, or similarity scores are meaningless. Vectors for a rebuilt SOP replace the old ones in one `putChunks` call.
