# Retrieval experiments (recall@5, 8 Nov 2026)

Goal: reach the plan's hybrid recall@5 of 0.85. **Corpus: 26 sources, 364 chunks** (the grid below was run on 281 chunks, before ten more sources were cut to short excerpts on 8 Nov; current results are in RESULTS.md) (256-word chunks unless stated). This replaces an earlier run on a 432-chunk corpus that held the full text of two documents we may not redistribute (see `THIRD_PARTY_NOTICES.md`); those are now short quoted excerpts, so the corpus is smaller and every number below was re-measured. Tuning set: `questions.jsonl` (30 questions). Held-out set: `heldout.jsonl` (14 questions, written before any tuning, run once at the end). Gold is recomputed from each question's verbatim anchor, so any chunking can be scored. Reproduce with `node scripts/eval_retrieval.ts [--set heldout] [--dir <variant>] [--cap N] [--stem] [--lex W] [--no-excerpts]`; chunk variants come from `kb/eval/variants.py`.

**A caveat on the questions.** Four of the 30 and three of the 14 have their answer in one of the short excerpt chunks, which are tiny and easy to rank. `--no-excerpts` scores only the others (26 and 11 questions); both are shown below.

## Tuning set (30 questions), recall@5 / MRR

| Change | BM25 | vector | hybrid |
|---|---|---|---|
| Baseline (256 words) | 0.83 / 0.700 | 0.67 / 0.425 | 0.83 / 0.608 |
| Per-source cap 1 / 2 / 3 | 0.60 / 0.73 / 0.83 | n/a | 0.53 / 0.63 / 0.80 |
| Chunks of 160 / 120 / 80 words | 0.87 / 0.83 / 0.80 | 0.70 / 0.67 / 0.53 | 0.77 / 0.73 / 0.80 |
| Chunks embedded with `search_document:` | 0.83 | 0.67 | 0.80 |
| Stemmed BM25 (`--stem`) | 0.87 / 0.685 | 0.67 | 0.87 / 0.625 |
| Stemmed, BM25 weight 2 / 3 in the fusion | 0.87 | 0.67 | 0.83 / 0.83 |
| Unstemmed, BM25 weight 3 | 0.83 | 0.67 | 0.83 / 0.644 |

## Held-out set (14 questions), recall@5 / MRR

| Configuration | BM25 | vector | hybrid |
|---|---|---|---|
| Plain | 0.93 / 0.891 | 0.71 / 0.694 | 1.00 / 0.818 |
| Stemmed | 0.93 / 0.887 | 0.71 / 0.694 | 1.00 / 0.818 |
| Stemmed, BM25 weight 3 | 0.93 / 0.887 | 0.71 / 0.694 | 1.00 / 0.860 |

## Without the excerpt questions

| Set | BM25 | hybrid | BM25 stemmed | hybrid stemmed |
|---|---|---|---|---|
| Tuning, 26 questions | 0.81 | 0.81 | 0.85 | 0.85 |
| Held-out, 11 questions | 0.91 | 1.00 | 0.91 | 1.00 |

## What this says

- **A hard per-source cap hurts.** Each question targets one source, and the right chunk is usually the best chunk of its source. Forcing a spread across sources pushes it out. Balancing is built (`perSource`, `capPerSource`) and tested, but off by default and not recommended.
- **Chunk size is not the lever.** Smaller chunks moved BM25 between 0.80 and 0.87 and did not help the vector side.
- **The vectors are weaker than BM25 on their own** (0.67 on the tuning set, 0.71 held-out) and fusion adds little: hybrid equals BM25 on the 30 questions (0.83) and is one question better on the 14 (1.00 against 0.93). Its MRR is lower on the tuning set.
- **Stemming** now moves the tuning set from 0.83 to 0.87 for both BM25 and hybrid, and does nothing on the held-out set. It is opt-in (`stem: true`), off by default, so agent retrieval inside runs is unchanged. An earlier run on the larger corpus showed stemming hurting the held-out set; the swing in both directions shows how little these sets can settle.
- **The 0.85 target.** Plain hybrid reaches 0.83 on the 30 questions (not met), 0.81 without the excerpt questions, and 1.00 on the held-out 14 (11 without excerpts). Stemmed hybrid reaches 0.87, but that setting was chosen on the same 30 questions. One question is 3 points on the 30 and 7 on the 14, so these are differences of one or two questions. We do not claim the target is met.

## What would move it

A larger question set (to tell real differences from noise), a stronger embedding model (the plan fixes ITU's `nomic-embed-text`), or re-ranking the top 10 to 20 with a cross-encoder or an LLM. A stronger model and re-ranking were not tried.
