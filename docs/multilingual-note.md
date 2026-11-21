# Multilingual note: English and Arabic

Mentor question: "Compare English vs Arabic input/output. Does the solution support multilingual input and output?"

Short answer: **partly, and we say where.** The screens can be shown in English or Arabic (right-to-left), and a person can type an Arabic question or Arabic procedure text. But the policy sources and the knowledge base are English, search over them works for Arabic only through a translation step or a small keyword glossary, and every Arabic string in the interface is a draft that has not been reviewed by a native speaker.

## What was measured (offline, no model call, 21 Nov)

| Task | English | Arabic | What differs | Limit |
|---|---|---|---|---|
| Interface (federal screens, login, replay) | Complete in English | Translated chrome, right-to-left, one click to switch from every page, choice remembered per browser | Direction, font (Noto Sans Arabic), numbers/ids/hashes kept left-to-right inside Arabic text | Draft strings, no native review. Use-case titles, entity names, policy and source text stay English |
| Search the knowledge base, no translation (`kb/eval`, 457 chunks) | BM25 recall@5 0.91 (n = 44), vector 0.84 | **0.00 for BM25, vector and hybrid** (n = 10; the BM25 tokenizer has no Arabic tokens, the corpus is English, and nomic v1.5 is English-centred) | Arabic words never match English passages | Arabic needs a bridge |
| Same Arabic questions, queries translated to English by the LLM first | | BM25 / vector / hybrid recall@5 1.00 / 1.00 / 1.00 (n = 6 and 4) | Retrieval is then as good as English | Uses cached translations (`kb/eval/ar-translations.json`); live translation was not run here and needs the model |
| Same Arabic questions, model unavailable, offline keyword glossary (`src/lib/un/query-gloss.ts`) | | BM25 recall@5 **0.90 (9 of 10)**, MRR 0.64 | A bag of English keywords, not a translation. Misses the one question whose terms are not in the glossary | Glossary is about 70 entries written by us after seeing the question topics; 10 questions only, so treat 0.90 as an upper-leaning estimate |
| Ask the licence-renewal agent a question (SOP-LIC-014, `/admin/federal/outside`) | 4 of 4 renewal questions answered with SOP citations; the two off-topic ones (deadline extension for illness, the moon) go to a person | Before: the 2 Arabic renewal questions tried both fell through to "outside the knowledge base". After (glossary fallback): 3 of 4 Arabic renewal questions answered with citations, 1 not (see below). Off-topic questions still go to a person, in both languages | The agent is asked the English form of the question; the screen shows which English query was used | Vocabulary outside the glossary falls through to a person. The answer text is quoted from the English SOP, not translated |
| SOP intake with Arabic procedure text | Steps, risks, actors and hours extracted by keyword rules | Does not crash. A four-step Arabic procedure was split into its 4 steps, but every step was classed "stays with a person", no risk flags, actors or systems were found, Arabic-Indic digits (٣٠ دقيقة) were not read as minutes, confidence 0.4, title "Uploaded SOP" | The extractor rules are English keywords | Arabic SOP analysis is not supported. The model analyser path was not tested. Extractor unchanged |
| Verdict, gates, signature, logbook | Identical engine | Identical engine: the verdict logic is language-independent (no model in the decision) | Labels only | Gate and verdict names are translated for display; the stored values stay English codes |

Arabic questions tried against the renewal agent (offline, glossary only):

| Arabic question | English equivalent | Arabic result | English result |
|---|---|---|---|
| ما هي المستندات المطلوبة لتجديد الرخصة التجارية؟ | What documents are needed to renew a trade licence? | answered (SOP-LIC-014#Q1, #S1) | answered (#Q1, #T03) |
| هل يمكنني دفع رسوم التجديد بالتقسيط؟ | Can I pay the renewal fee in instalments? | answered (#STEP-3, #T12) | answered (#STEP-3, #T12) |
| ما رسوم التجديد المتأخر؟ | What are the late renewal fees? | answered (#Q5, #T11, #R5) | answered (#STEP-3, #S6) |
| ما المستندات المطلوبة للتجديد؟ | What documents are required for renewal? | **not answered**: the glossary yields "documents renew renewal", which the agent's rule-based reasoner does not accept | answered (#T03) |
| هل يمكن تمديد المهلة بسبب المرض؟ | Can the deadline be extended because of illness? | goes to a person | goes to a person |
| كم عمر القمر؟ | How old is the moon? | goes to a person | goes to a person |

## Honest limits

- **The Arabic interface is a draft.** Every Arabic string was written by a model-assisted drafter and has not been reviewed by a native speaker. The strings that most need review are listed in the hand-over report; the dictionary files are `src/lib/un/i18n/*-ar.ts`. Do not describe it as native quality.
- **Policy and legal sources are English** (UAE, EU, Singapore, others) and are not machine-translated. Arabic readers see the English passage, marked as English.
- **Retrieval is cross-lingual only through a bridge** (LLM translation, or the small glossary). There is no multilingual embedding model; nomic v1.5 scores 0 on raw Arabic.
- **Dialects are not handled.** The glossary and the model prompt assume Modern Standard Arabic. Gulf, Levantine or Egyptian phrasing, and Arabic written in Latin letters, are not tested.
- **Not supported:** Swahili, French or any other interface language. The dictionary layer would take them, but there are no strings.
- **Output language:** answers quote the English SOP or source text. Agent drafts to a citizen are produced in the language of the template, which is English in this demo.
- The Arabic question sets are small (10 questions, paraphrases of English ones). One miss moves a score by 10 points.

## Remaining gaps by page (Arabic mode)

- Every page: use-case titles, entity names, policy name and jurisdiction, ids and hashes are data and stay English. The dev banner ("OFFLINE ...") and `title`/`aria-label` text on server-rendered parts stay English.
- Gaps and KB: gap statements, notes and the quoted source passages are English (marked, left-aligned); only the chrome is Arabic.
- Run page: engine event summaries, reasons, agent reasoning and citations are English.
- Compare: the policy engine's reason text is English.
- SOP intake: the extractor does not understand Arabic procedures (see the table).
- Replay: scenario titles, events and reasons from the recorded run are English.
- Landing page: its own Arabic copy is unchanged by this work.
- The static `npm run a11y` check does not test RTL layout; RTL was checked by viewing the pages in a browser (no horizontal overflow at 1280 px on the pages listed in the report; mobile width checked on the dashboard only).

## How to demo it live

1. Open any admin page; the **العربية / English** button is at the top of every page (top right, next to the "synthetic data" badge). The choice is remembered.
2. `/admin/federal/outside`: ask the renewal agent a question in Arabic, then the same one in English.
3. `/admin/federal/kb`: search in Arabic; the page shows which English query was used and whether it came from the model or the glossary.
