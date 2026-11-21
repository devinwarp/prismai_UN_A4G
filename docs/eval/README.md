# Evaluation: what is here and what it shows

| File | What |
|---|---|
| `agent-results.md` | S1, S2, S4, 20 runs each, `anthropic/claude-sonnet-5.5` |
| `agent-results-model2.md` | Same scenarios and settings, `google/gemini-3.1-flash-lite` |
| `agent-results-before-guard.md` | First run, before the add-only guard (kept for the record) |
| `redteam-results.md` | S5 red team: five attack types, 10 runs each |
| `citation-support.md`, `citation-support-sample.csv`, `citation-support-human-30.csv` | Does a cited chunk support the claim? Model-judged, human labels pending |
| `blind-scenarios-howto.md`, `blind-scenarios-example.json` | How someone outside the team writes scenarios blind |

Reproduce: `node --env-file=.env.local scripts/eval_agents.ts --n 20 --model <id> --out docs/eval/<name>`;
`--redteam` for S5; `--scenarios-file` for blind scenarios; `--dry` runs a stub model with no network. Tests run offline:
`tests/un-agent-eval.test.ts`, `tests/un-redteam.test.ts`.

## Two models, side by side (S1, S2, S4; 20 runs each)

| Metric | Sonnet 5.5 (S1 / S2 / S4) | Gemini 3.1 Flash-Lite (S1 / S2 / S4) |
|---|---|---|
| Path match | 20/20, 20/20, 20/20 | 20/20, 20/20, 20/20 |
| Citation id exists in the KB | 100%, 100%, 100% | 100%, 99.5%, 97.6% |
| Citation among chunks the model was shown | 95.0%, 98.8%, 95.7% | 100%, 98.4%, 94.0% |
| Rejected-message rate | 5.5%, 0.7%, 7.8% | 15.0%, 9.9%, 11.7% |
| Model messages dropped by the guard per run | 0.0, 3.2, 3.4 | 2.5, 6.2, 5.4 |
| Accepted messages that added evidence | 49.7%, 45.6%, 53.2% | 54.0%, 41.6%, 54.0% |
| Cost per run | $0.063, $0.081, $0.075 | $0.007, $0.009, $0.009 |
| Seconds per run | 25, 31, 33 | 19, 24, 25 |

Why this second model: a different vendor and family (Google, not Anthropic), listed on OpenRouter, capable of
following the JSON protocol, and about nine times cheaper per run. `openai/gpt-5-mini` was tried first and
dropped: a 1-run smoke test gave 36% unusable replies (hidden reasoning tokens eat the 900-token budget) and
about two minutes per run. The path match is identical, and that is the point of the next section: it does not
depend on the model. The messages differ: the smaller model is rejected more often and the guard drops more of
its messages.

## What the evaluation does and does not show

1. **Guard by design.** The 100% path match is largely by construction. The verdict comes from a deterministic
   policy engine, and an add-only guard lets a model message set a gate status only where the rules already
   set the same status that turn. So a model cannot change a verdict, and path match shows that this guard holds
   (the same 100% with two different models is the evidence), not that the model reasons well. Without the guard the same
   model scored 0% on S2 and 35% on S4. What the model does contribute is the extra cited evidence and
   explanation on accepted messages (about half of them add a new event or chunk citation); the quality of that
   contribution is only measured through the citation sample below, and not at all for the soundness of its reasoning.
2. **Scripted scenarios, written by the builders.** S1, S2 and S4 were written by the team that built the rules, so some
   circularity is unavoidable. The red team (S5) adds adversarial cases, also written by the team. The fix is outside authorship:
   `blind-scenarios-howto.md` lets someone who has not read the rule code write scenarios and run them. None have been run yet.
3. **Citation validity is existence, not support.** The reported 100% means the cited chunk id exists in `kb/chunks.json`
   (the agent also drops ids it did not show the model). It does not mean the chunk backs the claim. The first measure of support
   is `citation-support.md`: on 100 sampled messages a second model judged the chunk supported the policy point the message draws from it for
   59% (95% CI 49% to 68%), and supported or partly for 79%; if the whole claim must be backed, including case facts that no source can contain, 4%. These are labels from a model, not people. 30 rows are
   ready for human labelling, which will show how far to trust the judge.
4. **Fairness is out of scope.** The engine gates AI use cases against controls (hosting, logging, lawful data, human approval, disclosure).
   It does not evaluate, score or rank people, so there is no demographic outcome to test for bias. A deployed
   use case's own fairness (for example whether a citizen-facing assistant treats groups differently) is a gate input the entity must evidence;
   Prism does not measure it.
5. **Arabic is a small, model-dependent sample.** The Arabic retrieval check has 10 questions, and Arabic queries only work through an LLM translation step,
   so results depend on that model and have wide intervals. No agent scenario is run in Arabic.

Other limits: model calls are not seeded, so results vary slightly between runs; intervals treat steps and messages
within a run as independent and are therefore optimistic; two models is not a general claim about models.

## Red team (S5): what it found

See `redteam-results.md`. With a real model, 50 runs across five attack types produced 0 permissive flips (verdict unchanged
50/50, 95% CI 92.9% to 100%). The set did find one real bug in the deterministic engine, not the model: evidence that
contradicted itself inside one round (a fail then a pass on the same gate) was resolved by message order, so the later pass loosened
NO_GO to ESCALATE. Fixed in `src/lib/un/protocol.ts` (the stricter state stands) with regression tests. Two design observations remain, stated plainly:

- A declared fix (`fix_declared`) is accepted on the applicant's say-so and moves NO_GO to ASSISTANT_ONLY (a person acts; nothing autonomous). It can never
  reach a GO verdict: only the gate owner's re-test pass can. Whether free text in a declaration is true is not checked.
- An owner role's `pass` event is trusted. If a hostile party could inject events into the owner's channel, they could pass a gate; the system
  secures the verdict logic, not the event feed. Authenticating event sources is outside this prototype.
