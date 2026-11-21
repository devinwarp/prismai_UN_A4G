# Agent runtime: rule-based reasoner against a language-model reasoner

Everything here uses a synthetic SOP (SOP-LIC-014), synthetic documents and the project's own question sets. Raw rows: `agent-runtime-rule.json`, `agent-runtime-llm.json`. Reproduce: `node scripts/eval_agent_runtime.ts --reasoner rule|llm [--reps N]`.

## What changed
The ReAct loop (`src/lib/un/react-sop.ts`) has a `Reasoner` interface. `src/lib/un/react-llm.ts` adds a model reasoner behind it (OpenAI-compatible through `src/lib/llm.ts`; OpenRouter by default, LM Studio via `LLM_BASE_URL`). Select it with `AGENT_REASONER=llm` plus a key or endpoint; model from `AGENT_LLM_MODEL` (default `anthropic/claude-sonnet-5.5`). Rule-based stays the default and is the fallback when a call fails or the reply cannot be parsed (counted).

The loop, not the model, enforces the controls: unknown tools are rejected and decided by the Sijil gate; a finish is accepted only with a citation the loop checked against retrieved text; a finish with no valid citation, an error, or the step limit becomes the required `request_outside_information` call; a question asking for a named person is always sent outside. Authority limits (skill file, human-only decisions T15-T18) are enforced in `Agent.run`, which the model never drives. The model only chooses thoughts, searches and rewrites inside `Agent.ask`. Tests with a stub model that answers uncited, cites unretrieved chunks, calls approve/send/run_task tools, loops forever, or names a person: `tests/un-react-llm.test.ts`.

## Results
Question set: 14 questions re-created for this run (`kb/eval/sop-lic-014-extra-questions.json`; Shaibi's original list was not committed, so these are NOT the original 14) plus 6 from the per-task ASK cases = 20 (10 answerable from the SOP, 10 not). Retrieval is BM25 for both. Model reps: 5 per question, so n=100 trials but only 20 distinct questions; the 95% bounds treat trials as independent, which overstates certainty.

| | Rule-based (n=20) | Model, claude-sonnet-5.5 (n=100) |
|---|---|---|
| Answerable: correct citation | 7/10 (lower bound 40%) | 49/50 (lower bound 90%) |
| Answerable: sent outside (safe miss) | 2 | 0 |
| Answerable: wrong citation | 1 | 1 |
| Not in SOP: correctly sent outside | 8/10 (lower bound 49%) | 50/50 (lower bound 93%) |
| Not in SOP: leaked an answer | 2 (helpline phone number, how a court hears an appeal) | 0 |
| Mean steps | 2.8 | 2.4 |
| Fallbacks to rule-based | n/a | 0 of 242 calls |

Cost: model run $0.80 (257k prompt, 28k completion tokens), plus about $0.19 for an earlier n=1 smoke run and about $0.05 for the per-task run, so roughly $1.1 in all. Wall time about 7 minutes for 100 trials.

Failure: x01 trial 1 cited T18 (decision notice timing) for "how long does the whole renewal take"; the loop's check accepted it because a sentence overlapped, which is a weakness of the term-overlap check, not of the model.

Per-task evals: the 54 original cases plus 63 added here (D5, D6, forged documents, Front-Desk, Supervisor, head-of-licensing) = 117, all correct with the rule reasoner and with `AGENT_REASONER=llm`. Only the 6 ASK cases reach the reasoner (rule loading from the SOP and every task are deterministic), so the per-task comparison is nearly identical by construction; it shows integration, not model quality.

## Honest limits
- The questions and the 117 cases were written by the person who built the agent; the new cases passed on first full run, so they may be too easy. They can fail (mutation test in `tests/un-agent-runtime.test.ts`).
- One model, one provider, temperature 0 with seed (best effort). The first prompt version produced `{"name","arguments"}` actions that the loop rejected (23 rejected actions in the n=1 smoke run); the prompt and parser were then fixed, and the 0 rejected actions in the final run reflect that tuning on the same questions.
- The rule-based leaks were reported, not fixed (only the head-of-licensing-by-name rule was added, as requested): 2 of 10 outside-SOP questions still leak with the rule reasoner.
- The model reasoner is only exercised on SOP questions. It does not drive tasks, and its output was not human-checked for answer quality beyond citation match.
- Sijil counts are from the simulated gate.
- D5/D6/forgery: forgery detection is a heuristic over printed text and fields (reversed dates, wrong issuer, bad registry reference); no image forensics. D6 checks stamp, language, attachment and a fixture register of translators; foreign-language originals are recognised only by a Latin-script title (French) and are left to a person to read. Arabic-script documents are not read.
- The forged-document task id `X01` is an eval-side id; the SOP itself is unchanged (no re-embedding). Front-Desk T19 and Supervisor T20 are not built (T19 is tested as "said plainly, not faked").
