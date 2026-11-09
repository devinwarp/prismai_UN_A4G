# Third-party notices

Prism itself is licensed AGPL-3.0-only (see `LICENSE`). The material below is
used under its own licence, except where this file says the position is open.

## RESOLVED: copyright of two knowledge-base sources (decision of 8 Nov 2026)

**Status: resolved by removal.** The project team decided there was no time to obtain written permission, so the full texts of two documents were removed from this repository and replaced by short quoted excerpts with their URLs. The full texts were never published: the commits that carried them were squashed before anything was pushed (see "History").

| Source (excerpt id) | Rights statement | Removed | What remains |
|---|---|---|---|
| DESC Information Security Regulation, Version 3.1 (`desc-isr-excerpts`) | The document says "Copyright © 2024 Dubai Electronic Security Center all rights reserved" and that no part may be reproduced or transmitted without DESC's prior written permission. | The full text as chunks, `kb/docs/desc-isr-3-1.txt`, the embeddings of those chunks and the PDF (the PDF was never committed). | Six short verbatim excerpts, each at most 15 words, in `kb/sources.json`, each with its location in the document (for example "control 13.2.3.1") and the DESC page https://www.desc.gov.ae/regulations/standards-policies/ as its URL. They are chunked into `kb/chunks.json` and embedded in `kb/vectors.json`. The regulation is available from DESC on request. |
| AI Integration Matrix Framework for Government Organizations (Digital Dubai, 2026) (`dubai-ai-matrix-excerpts`) | No licence or redistribution statement was found in the PDF. With no stated terms, rights are reserved by default. | The full text as chunks, `kb/docs/dubai-ai-matrix-framework.txt`, its embeddings and the PDF (never committed). | Three short verbatim excerpts, each at most 15 words, with their chapter, and the Digital Dubai launch announcement as the URL. |

The excerpts are short quotations for citation, each attributed and linked to its source, and are not a substitute for the documents. `sha256` in the knowledge base is the hash of the document each excerpt was taken from, kept as provenance. If DESC or Digital Dubai objects, delete the two excerpt entries from `kb/sources.json` and rebuild (`python kb/build.py --embed`).

**How the limit is kept.** `kb/build.py` refuses to build an excerpt of more than 15 words, and a test checks the same. The build reads the excerpts from `kb/sources.json` and does not need the PDFs. `kb/docs/desc-isr-3.1.pdf` and `kb/local/` stay in `.gitignore` so a PDF placed there for reading cannot be committed by accident.

**History.** The text was in this branch's earlier commits. Nothing had been pushed: the only remote branch was `origin/main`, and none of those commits was on it. The branch's commits were squashed into one commit built from the final tree, which does not contain the text. The local backup branch and the old references were deleted and the object store pruned, so the text is not in this repository's history.

**Consequences.** The S1 hosting gate cites a short ISR excerpt on cloud security controls (`desc-isr-excerpts#0`) instead of the full control text. The Matrix is represented by its launch announcement and three excerpts. The knowledge base is 26 sources and 364 chunks (after the second to fifth steps below), and the retrieval results were re-measured on it (`kb/eval/RESULTS.md`, `docs/RETRIEVAL_NOTE.md`).

### Decision log

| Item | Decision | Date | By | Reference |
|---|---|---|---|---|
| Ten further web-page and document sources (table below) | Cut to excerpts of at most 40 words, with attribution and URL | 8 Nov 2026 | Project team | Second step, this section |
| DESC ISR 3.1 | Removed; short excerpts and URL only | 8 Nov 2026 | Project team | This section |
| Digital Dubai Matrix framework | Removed; short excerpts and URL only | 8 Nov 2026 | Project team | This section |

### Second step: ten further sources cut to excerpts (8 Nov 2026)

The knowledge base also held the cleaned full text of web pages and documents of other publishers. Those are protected by copyright and carry no open licence on file, so the same remedy was applied: the full text was removed and each source is now 5 to 7 verbatim excerpts, **at most 40 words each**, with attribution (issuer, document and location) and the source URL. The `sources.json` entries keep their id, URL, date and `source_sha256` (the hash of the page as it was read, kept as provenance), so chunk ids stay `<source-id>#N`. The text files in `kb/docs/` were deleted. Earlier commits of the remote repository still contain the removed text, so a public release must use the fresh single-commit history. `kb/build.py` refuses an excerpt of more than 40 words, and a test checks the same.

| Source id | Publisher | Excerpts |
|---|---|---|
| `uae-cabinet-agentic-50`, `uae-cabinet-2026-05-18` | UAE Cabinet / Government Media Office releases | 7, 6 |
| `dubai-ai-matrix-launch` | Digital Dubai launch release (Government Media Office) | 7 |
| `uae-ai-charter` | UAE AI Office, Charter (July 2024); extended in the third step to all 12 principles | 12 |
| `uae-cyber-ai-policy` | UAE Cyber Security Council, via u.ae | 5 |
| `uae-data-protection-laws` | UAE Government portal u.ae (replaced in the fourth step) | 7, then 16 |
| `dff-agentic-accelerator` | Dubai Future Foundation | 5 |
| `dff-ai-sandbox` | TechAfrica News, reporting Dubai Future Foundation | 5 |
| `sg-agentic-summary` | Baker McKenzie, summarising IMDA | 6 |
| `un-global-dialogue` | UN News | 5 |

### Third step: Charter extended, National AI Strategy 2031 added (8 Nov 2026)

Two UAE federal AI documents are held as excerpts only, never as full text, under the same decision.

| Source id | Document | Excerpts | Terms |
|---|---|---|---|
| `uae-ai-charter` | UAE Charter for the Development and Use of AI (July 2024), ai.gov.ae | 12, one verbatim excerpt of at most 40 words for each of the Charter's 12 principles, with principle number and name | The ai.gov.ae site terms could not be retrieved and no licence was found in the PDF. Rights are treated as reserved. |
| `uae-ai-strategy-2031` | UAE National Strategy for Artificial Intelligence 2031 (Office of the Minister of State for AI), ai.gov.ae | 10, each at most 40 words, from the Executive Summary and Objectives 1, 4, 5 and 8 | Same: site terms not retrievable, no licence found. The document states no publication date (it mentions the February 2018 World Government Summit), so `date` is null. |

`source_sha256` is the hash of the PDF as downloaded, kept as provenance. The vectors of these 16 new chunks are approximate (`docs/RETRIEVAL_NOTE.md`). If the publisher objects, delete the `excerpts` from the two entries in `kb/sources.json` and rebuild.

### Fourth step: PDPL text and Smart Dubai AI Ethics added as excerpts (8 Nov 2026)

| Source id | Document | Excerpts | Terms |
|---|---|---|---|
| `uae-data-protection-laws` | Federal Decree-Law No. (45) of 2021 on the Protection of Personal Data, official English text, 29 pp, uaelegislation.gov.ae/en/legislations/1972. Replaces the u.ae portal summary under the same id, so existing references keep working. | 16, each at most 40 words, verbatim, with the article number in `section` (Arts. 1, 2, 4, 5, 6, 7, 9, 15, 18, 21, 22, 24, 26) | The site terms of uaelegislation.gov.ae could not be read and no licence was found in the PDF. Rights are treated as reserved. The law's government-data exclusion (Art. 2(2)) is among the excerpts. |
| `dubai-ai-ethics-2019` | Smart Dubai (now Digital Dubai), AI Ethics Principles & Guidelines, 35 pp, smartdubai.ae/initiatives/ai-principles-ethics | 14, each at most 40 words, verbatim, covering the four principles (Ethics, Security, Humanity, Inclusiveness), fairness, accountability, transparency, explainability, human oversight, privacy and the self-assessment tool | The Digital Dubai site terms could not be read, they reserve intellectual property rights, and no licence was found in the PDF. The PDF states no publication date (its changelog ends at v1.6, 30/12/2018), so `date` is null. |

`source_sha256` is the SHA-256 of each PDF as supplied. Every excerpt was checked as a literal substring of the PDF text (whitespace and ligatures normalised). The vectors of these 30 chunks are approximate (`docs/RETRIEVAL_NOTE.md`). If the publisher objects, delete the `excerpts` from the entry in `kb/sources.json` and rebuild.

### Fifth step: four primary global texts added as excerpts (9 Nov 2026)

Each document was fetched from the publisher, its reuse terms were looked up, and excerpts of **at most 40 words, verbatim**, were taken; every excerpt was checked as a literal substring of the extracted text (whitespace and PDF line-break hyphens normalised). `source_sha256` is the hash of the file as fetched. The full texts are not stored. The finding for each:

| Source id | Document as fetched | Reuse terms found | Treatment |
|---|---|---|---|
| `sg-imda-agentic-mgf` (12 excerpts) | IMDA, Model AI Governance Framework for Agentic AI, **Version 1.5, 20 May 2026 (updated 5 June 2026)**, 53 pp, from imda.gov.sg. Version 1.0 was launched on 22 January 2026; the current PDF is v1.5, so excerpts cite v1.5 and give PDF page numbers. | The PDF carries no licence statement. IMDA's Terms of Use page is rendered by script and its text could not be read here. Rights are treated as reserved. | Excerpts only. Supersedes the Baker McKenzie summary (`sg-agentic-summary`) wherever a gap cites Singapore; the summary stays in the knowledge base because a scenario cites it. |
| `eu-ai-act-articles` (9 excerpts) | Regulation (EU) 2024/1689, Official Journal text of 12 July 2024 (Arts. 14, 26, 86 and Annex III point 5), fetched from the Publications Office (`publications.europa.eu/resource/celex/32024R1689`) because eur-lex.europa.eu answers automated requests with a bot challenge. | The EUR-Lex legal notice could not be read here (same challenge). The European Commission's copyright notice says EU-owned content is licensed under CC BY 4.0 under Commission Decision 2011/833/EU: "reuse is allowed, provided appropriate credit is given and changes are indicated". Applying that to the Official Journal text of the Regulation is our reading, not something the EUR-Lex notice confirmed to us. | Excerpts only, with attribution. Later amendments or corrigenda to the Regulation were not checked. Annex III point 5(a) (public authorities evaluating eligibility for essential public assistance benefits and services) was confirmed in the Official Journal text. `eu-ai-act-annex3` (full text from a non-official site) is unchanged. |
| `g7-hiroshima-code` (6 excerpts) | Hiroshima Process International Code of Conduct for Organizations Developing Advanced AI Systems, 8 pp, 30 October 2023, as published on the European Commission site. | The page is on a Commission site whose copyright notice applies CC BY 4.0 to content the EU owns; the Code is a G7 document, so that licence may not extend to it. Rights are treated as reserved. | Excerpts only. It is voluntary guidance for developers of advanced AI systems, not for public-service deployers. |
| `un-system-white-paper` (6 excerpts) | United Nations System White Paper on AI Governance, CEB/2024/1/Add.1, 9 August 2024, reissued 24 October 2024, 57 pp, from unsceb.org. | The UN Terms of Use allow download and copying for personal, non-commercial use "without any right to resell or redistribute them or to compile or create derivative works"; the CEB copyright page was empty when fetched. Rights are treated as reserved. | Excerpts only, with paragraph numbers where the passage is numbered. |

The vectors of these 33 chunks were computed with transformers.js (`nomic-ai/nomic-embed-text-v1.5`), not with ITU's `embed_texts` through Ollama; see `docs/RETRIEVAL_NOTE.md`. Not ingested and cited by name only: GDPR Article 22 (wording not verified), EU AI Act Article 12; neither is a source id.

**Left as full text, and why.**

- `nist-ai-rmf`: NIST AI RMF 1.0, a US government publication (public domain in the US).
- `eu-ai-act-annex3`: text of EU legislation; the site (artificialintelligenceact.eu) is non-official, the law is not copyright-protected in the same way and is reused with the official source named.
- `itu-y3172-summary`, `itu-eu-ai-act-summary`, `itu-sandbox-summary`: summary files from the MIT-licensed ITU reference repository (see below).
- `itu-y3172-standard`, `itu-ai-ready-2025`: ITU publications taken from the same MIT-licensed repository at the pinned commit and used for retrieval, as described below; the MIT licence covers the repository's code, so these two remain a residual risk to confirm with ITU.
- `ani-agentic-workshop`: an ANI/WAM report of about 220 words, below the 250-word threshold used for this review; it is a short news item with its URL, and can be cut the same way if wanted.

The excerpts are short quotations for citation, each attributed and linked, and are not a substitute for the originals. If a publisher objects, delete its entry's `excerpts` from `kb/sources.json` and rebuild.

## ITU AI Readiness reference repository

- Source: https://github.com/CrashingGuru/ITUAIReadiness
- Pinned commit: `84010da9e9c443afcceeccb86d1700a662223395` (also recorded as
  `itu_repo_commit` in `kb/sources.json`)
- Licence: MIT

Used in two ways:

1. **Code, imported at build time and not copied into this repository:**
   `parse_file`, `chunk_text`, `embed_texts` and `KnowledgeBase` from
   `simulation/server/knowledge` (see `kb/build.py`). The HTML cleaning step is
   ours.
2. **Summary files copied into the knowledge base** (`kb/docs/`), from
   `simulation/server/knowledge/InputDocs/`:
   - `AI_Use_Cases/ITU-T_Y.3172_summary.txt` → `kb/docs/itu-y3172-summary.txt`
   - `AI_Strategies/EU_AI_Act_summary.txt` → `kb/docs/itu-eu-ai-act-summary.txt`
   - `AI_Strategies/ITU_AI4G_Sandbox_summary.txt` → `kb/docs/itu-sandbox-summary.txt`

   Their SHA-256 hashes at the pinned commit are in `kb/sources.lock.json`.

```
MIT License

Copyright (c) 2026 Vishnu Ram OV

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Two further documents from the same folder are read at build time and only
their extracted text is kept (`kb/docs/`, `kb/chunks.json`): the Recommendation
ITU-T Y.3172 (06/2019) PDF and `AI_Ready_Framework_2025.pdf`. The MIT licence
covers the repository's code; those two documents are ITU publications, cited
here with their file-level URL at the pinned commit and used for retrieval.

## Other knowledge-base sources

The other documents in `kb/docs/` are public texts kept for retrieval with
their source URL, issuer and SHA-256 in `kb/sources.json` and
`kb/sources.lock.json`. They remain the property of their publishers; the
sources that are not open or public-domain are held as excerpts only (see
"Second step" above).
