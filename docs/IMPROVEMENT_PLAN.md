# PrismAI: plan to raise every judging criterion to 4.5–5

- **Prepared:** 8 November 2026.
- **Repository:** `github.com/devinwarp/prismai_UN_A4G`, commit `25ef3b1`.
- **Inputs:** a code review of that commit (49/49 unit tests pass via `node --test tests/*.test.ts`); the 4-page technical report; the 3:11 video (reviewed from frames and on-screen captions); ITU's reference repo `CrashingGuru/ITUAIReadiness`.
- **Deadlines:**
  - **T1:** submission, 10 Nov.
  - **T2:** shortlist, 18 Nov. The demo video becomes mandatory here.
  - **T3:** onsite final in Dubai, 8 Dec.

Scores are our own estimates against ITU's published criteria. ITU publishes no weights.

---

## 1. Where we are and where we can get to

| # | Criterion (ITU wording) | Now | After T1 (10 Nov) | After T2 (18 Nov) | After T3 (8 Dec) | Main gap |
|---|---|---|---|---|---|---|
| C1 | Knowledge base quality: completeness, accuracy and structure of ingested national material; retrieval under query | **3.0** | 4.0 | 4.5 | **5.0** | 17 sources and 139 chunks, 51% of them NIST; navigation text in chunks; many secondary sources; keyword-only retrieval; DESC not ingested |
| C2 | Agent capability: relevance and accuracy of agent responses in simulated error scenarios | **3.5** | 4.0 | 4.5 | **5.0** | Agents echo gate status; no exchanges between agents; S2 events inert; S3 has no agents; nothing measures agent accuracy |
| C3 | Gap identification: relevance of gaps and accuracy of global examples | **4.0** (report) / 2 (video) | 4.5 | 4.5 | **5.0** | Gaps live only in the report; some global examples come from summaries; not shown in the app or video |
| C4 | Auditability: logs, reasoning traces, source attribution | **4.5** | 4.5 | **5.0** | 5.0 | Verdicts editable by hand (bypass); no human signature record; the log isn't append-only in the database; no CLI verifier |
| C5 | Alignment with Y.3172 and the AI Readiness Framework | **4.0** | 4.5 | **5.0** | 5.0 | Y.3172 PDF not ingested; video says "policer" (the standard says **P = policy**); Readiness dimension 11 (inclusion) not addressed |

Reaching 4.5 or more on every criterion by 10 November is not realistic in two days. **The T1 target is "no criterion below 4"**, plus fixing anything that could make a judge doubt our claims. Reaching 4.5–5 everywhere is achievable by the shortlist and the final, where the video and live demo weigh most.

---

## 2. Fix first: integrity issues that contradict our own claims (T1, must do)

These come first. A judge who finds any of them will mark down C2, C4 and our credibility together.

| ID | Issue | Fix | Acceptance check |
|---|---|---|---|
| I-1 | **Verdicts and the `compliant` flag can be set by hand** in the use-case `PATCH` route (`src/app/api/admin/un/use-cases/[id]/route.ts`) and the dashboard table. GO_AUTONOMOUS can even be set on a client-facing case. This bypasses the hard gates and the client-facing cap | Remove `verdict` and `compliant` from the PATCH body and the table editors. Write `verdict` **only** from a completed scenario run, storing `run_id` and `head_hash` on the use case. Write `compliant` **only** from a Sijil attestation (`sijil-store.ts`), storing the report's sha256 | A test proves a PATCH with `verdict` is rejected (400) and the dashboard reads only engine-written values |
| I-2 | **HITL rules never affect a verdict.** `hitlBreaches()` in `hitl.ts` is only called in tests, yet the video says "break a rule = human approval gate fails" | When a run starts, compute `hitlBreaches(loadHitlConfig(entity), facts, unmet)` and put it in `CaseState.hitlBreaches`; in `decide()` (`policy.ts`), any breach fails the `human_final_approval` gate. Add a scenario step where a rule breach forces NO_GO (S1 T2 already fits: an agent sends messages without officer release) | A unit test shows a breach turns GO_SUPERVISED into NO_GO; the S1 T2 trace cites the entity rule id |
| I-3 | **`npm test` fails as documented** on Node 22 ("Cannot find module …/tests") | `"test": "node --test \"tests/*.test.ts\""`, add `"engines": {"node": ">=22.18"}`, and confirm `"type"` handling. Add a GitHub Actions workflow running the tests (and the KB evaluation in C1-6) | Green CI badge in the README |
| I-4 | **No human signature** on the final verdict, although "Human final approval" is Gate 4 in the video | Add a "Sign / Withhold" step after the last scenario step. It writes a hash-chained record `{type:"HUMAN_SIGNATURE", signer_id, role, decision, comment}`; the use-case verdict is written only after a signature | The trace viewer shows the signature as the final chained record |
| I-5 | **Claims that overstate:** report says "ITU reference code reused unmodified" (the HTML parser is custom; embeddings are unused at runtime); video caption says "policer"; video says "by 30 April 2028" (inferred: the Cabinet said on 23 Apr 2026 "within two years"); PDF author metadata reads "Meng, Jiaying" | Correct the wording: "ITU parsing and chunking functions reused; HTML cleaning ours". Change "policer" to "policy (P)". Label the deadline "≈ April 2028 (two years from 23 Apr 2026, assumed)". Clear the PDF metadata | Re-read report and captions against this list |
| I-6 | **Licence notice:** three ITU summary files are copied without ITU's MIT notice | Add `THIRD_PARTY_NOTICES.md` with ITU's MIT licence; pin the ITU repo commit in `kb/sources.json` | File present; commit hash recorded |

---

## 3. C1, knowledge base quality: from 3.0 to 5.0

### What a 5 looks like
The knowledge base:
- is complete for the domain (agentic AI in public services) and anchored in **primary national texts**;
- is clean, typed and dated;
- is built with ITU's pipeline (including its embeddings);
- has **measured** retrieval quality;
- every gate and every agent mandate has at least one primary-source citation.

### Actions

| ID | Action | Detail | Tier |
|---|---|---|---|
| C1-1 | **Ingest primary national material** | Include in full:<ul><li>the **Digital Dubai AI Integration Matrix whitepaper PDF** (56 pp; we hold it, and it is the core national document; check the redistribution terms first);</li><li>the **UAE AI Charter PDF** (ai.gov.ae; currently only 3 chunks);</li><li>the **DESC Information Security Regulation PDF** (replace the landing page; this gives the S1 hosting gate its citation);</li><li>the **PDPL legal text** (uaelegislation.gov.ae) in place of the u.ae portal page;</li><li>the National Cyber Security Policy for AI;</li><li>the UAE National AI Strategy 2031;</li><li>both Cabinet releases (23 Apr and 18 May 2026);</li><li>the DFF/DCAI accelerator and the DFF AI Sandbox pages.</li></ul> | T1 (DESC, Matrix, Charter); T2 (rest) |
| C1-2 | **Ingest ITU's own InputDocs** (already in the ITU repo, so they suit the judges) | `AI_Use_Cases/T-REC-Y.3172-201906-I!!PDF-E.pdf` (the real Y.3172); `AI_Strategies/AI_Ready_Framework_2025.pdf`; `ITU_AI4G_Sandbox_summary.txt`; `Singapore_Model_AI_Governance_GenAI_2024.pdf` (secondary only: it is the generative-AI framework, not the agentic one; see C1-3); `UN_System_White_Paper_AI_Governance_2024.pdf`; `Governing AI for Humanity Final Report.pdf`; `ASEAN_AI_Governance_Ethics_Guide_2024.pdf`; `G7_Hiroshima_AI_Code_of_Conduct.pdf`; `Saudi_Arabia_NSDAI.pdf` (regional comparator) | T1 (Y.3172, AI Ready 2025); T2 (rest) |
| C1-3 | **Primary global texts** | **IMDA Model AI Governance Framework for Agentic AI (Jan 2026)**, the primary PDF, replacing the Baker McKenzie summary; **EU AI Act** official text (EUR-Lex): Art. 14 (human oversight), Art. 26 (deployer duties), Art. 86 (right to explanation), Annex III; NIST AI RMF 1.0 (keep); ISO/IEC 42001 abstract only (paywalled) | T2 |
| C1-4 | **Clean and balance** | Use ITU's `_strip_html` (in `ingest.py`) or a readability pass, then a boilerplate filter (nav, cookie and footer text). De-duplicate near-identical chunks. Cap any single source at about 15% of chunks, or retrieve per source. Target **35–45 sources**, with **UAE/Dubai material at 50% or more of chunks** | T1 (clean); T2 (balance) |
| C1-5 | **Metadata to ITU's schema plus ours** | Call ITU `build_metadata()` and merge our fields (`jurisdiction, instrument_type, binding, date, topics, matrix_quadrants, sha256, url`). Every source must have a date and a **file-level** URL. Correct `binding` (e.g. the DESC landing page is not binding). Pin the ITU commit | T1 |
| C1-6 | **Vectorise as ITU does, and retrieve hybrid** | Build: `kb/build.py --embed` using ITU `embed_texts` (Ollama `nomic-embed-text`) into ITU's ChromaDB collection `kb_main`; export the vectors with the chunks.<br>Runtime (the web app can't call Ollama on Vercel): store vectors in **Supabase pgvector**, embed queries with **transformers.js `nomic-ai/nomic-embed-text-v1.5`** (prefixes `search_document:` / `search_query:`; no paid key), and fuse **vector + BM25 with reciprocal rank fusion**. BM25 alone is the fallback | T2 (T1 if time) |
| C1-7 | **Measure retrieval** | `kb/eval/questions.jsonl`: **30 questions with gold chunk ids**, written from the gates, agent mandates and gap rows (e.g. "Where must model calls be hosted?" gives DESC ISR). Report **recall@5 and MRR** for BM25, vector and hybrid. Target: hybrid recall@5 of at least 0.85. Run in CI and put the table in the report | T2 |
| C1-8 | **Coverage matrix** | Generate `kb/coverage.md`: each gate × each agent mandate → the primary chunk(s) cited. No empty cells | T2 |
| C1-9 | **Knowledge base explorer page** (`/admin/federal/kb`) | Search box → top-k chunks with source, date, binding flag, jurisdiction badge and the matched quote. This shows "retrieve relevant policy context under query" live | T2 |

---

## 4. C2, agent capability in error scenarios: from 3.5 to 5.0

### What a 5 looks like
- Agents **reason about partial information**: they ask for evidence, challenge each other, change position, and cite sources.
- The deterministic engine still decides.
- Every scenario changes outcomes at each step.
- **Agent accuracy is measured and reported.**

### Actions

| ID | Action | Detail | Tier |
|---|---|---|---|
| C2-1 | **Real protocol exchanges** (`protocol.ts`, `round.ts`) | The coordinator sends `EVIDENCE_REQUEST` to the owning agent when a gate lacks evidence. The owner answers `EVIDENCE` or "unknown". A `CHALLENGE` is broadcast to all affected roles (not only the coordinator). The innovator replies `POSITION_UPDATE`. Two unresolved conflicts produce `ESCALATE` to the human. All message types are used at least once in S1–S3 | T1 (S1); T2 (all) |
| C2-2 | **Per-agent "what I know" view** | Run page columns, one per agent, listing the events each has received at each step. This makes the uneven distribution visible | T1 |
| C2-3 | **Redesign S2 so every event matters** | T1 Sijil hallucination alert → ASSISTANT_ONLY (fee answers restricted to the retrieved fee table). T2 citizen complaint → the complaints agent links it to T1 and adds the `fee_accuracy` gate. T3 transparency requirement → `ai_disclosure` gate re-tested. T4 re-test → GO_SUPERVISED. Update the report's expected path to match | T1 |
| C2-4 | **S3 with agents** | Federal coordinator, compliance and policy-adviser agents generate the records (not code-built). The mid-run policy update actually re-scores the affected entities (UC13–UC16) | T2 |
| C2-5 | **Add S4, a hijack (prompt-injection) test** | A citizen message tries to make the external agent waive a fee. The security agent's gate is "acts only within permissions"; Sijil records rejects. This covers the National Cyber Security Policy for AI and the adversarial requirement | T2 |
| C2-6 | **Add conflicting evidence** | In S1 T3 the frontline agent reports "officer release restored" while Sijil still shows bypass rejects. The coordinator must request fresh evidence before ASSISTANT_ONLY | T2 |
| C2-7 | **Score model mode** | Run each scenario **10 times** with `?llm=true`. Report: **path match vs expected (%)**, **citation validity (%)** (cited chunk exists and supports the claim), **protocol-rule refusals**, and **time per step**. Put the table in the report. Deterministic mode stays the reference | T2 |
| C2-8 | **Expected vs actual export** | For each run, generate a table (step, expected verdict, actual verdict, match). This is exactly what ITU asks the video to show | T1 |
| C2-9 | **Replay for every scenario** | A "Replay from log" button that rebuilds all verdicts from the stored chain (S3 included) | T2 |
| C2-10 | **Entity goals feed alignment** | Add 3–5 goals per entity. Sijil "goal alignment" is computed against those goals and the pilot's acceptance criteria (deterministic formula, documented), not a random number | T2 |

---

## 5. C3, gap identification: from 4.0 to 5.0

### What a 5 looks like
- Gaps are **derived by the system** from the mapping, not just written up.
- They cover all six of ITU's categories.
- Each gap carries **two or more accurate global examples quoted from primary texts**.
- They are visible in the app, the report and the video.
- They are framed as domain gaps (agentic AI in public services), not as recommendations to one country.

### Actions

| ID | Action | Detail | Tier |
|---|---|---|---|
| C3-1 | **Gap register in the app** (`/admin/federal/gaps`) | For each obligation the gates and agents need (oversight levels, approval authority, hosting, disclosure, recourse, measurement, cross-entity data sharing, counting rule): does any ingested **UAE/Dubai** chunk cover it? If not, it's a gap. Attach global examples by retrieval, with verbatim quotes and chunk ids | T2 (static version T1) |
| C3-2 | **Cover all six ITU categories** | Unclear responsibilities; standards; technology; legislative; coordination; conflicts between objectives. At least one gap each; at least two global examples each | T1 (report) |
| C3-3 | **Replace summary sources with primary quotes** | Singapore agentic framework (IMDA PDF); EU AI Act Art. 14, Art. 86 and Annex III (EUR-Lex). Verify the exact Annex III point for essential public services and benefits before citing. G7 Hiroshima Code; UN System White Paper. Fill the "Citizen recourse" row, currently "Not verified here", with EU AI Act Art. 86 and GDPR Art. 22 **[verify wording]** | T1 |
| C3-4 | **Gap → Prism response → readiness factor** | Each row links to the Prism control that addresses it and to the AI Readiness 2.0 dimension it affects | T2 |
| C3-5 | **Show it in the video** | 30 seconds on the gap page: one row expanded with the UAE source silent and the global quote shown | T2 |

---

## 6. C4, auditability: from 4.5 to 5.0

| ID | Action | Detail | Tier |
|---|---|---|---|
| C4-1 | Integrity fixes I-1 and I-4 | Verdicts and compliance only from engine or attestation; human signature in the chain | T1 |
| C4-2 | **Append-only storage** | Table `un_trace_records(run_id, seq, record jsonb, hash, prev_hash)` with an insert-only policy and a trigger that rejects UPDATE/DELETE; `head_hash` derived, not stored separately | T2 |
| C4-3 | **External anchoring** | On run completion, write the head hash to a signed `runs/<run_id>.head` file in a public anchor (e.g. a commit to an `anchors` branch or an RFC 3161 timestamp). This shows the chain can't be silently rewritten even by an admin | T3 |
| C4-4 | **Offline verification** | `scripts/verify_log.ts <run-export.json>` → OK, or the first broken record. An "Export audit bundle" button (records, cited chunks with sha256, Sijil report, signature). Judges can verify without our database | T1 (script); T2 (button) |
| C4-5 | **Attribution everywhere** | Every agent claim shows its citation or the reason it was rejected ("uncited claim refused"); the Sijil report hash is chained into the run | T2 |

---

## 7. C5, ITU standards alignment: from 4.0 to 5.0

| ID | Action | Detail | Tier |
|---|---|---|---|
| C5-1 | **Correct Y.3172 terminology, from the standard itself** | Rec. ITU-T Y.3172 (06/2019) defines PP as "responsible for cleaning data, aggregating data or performing any other preprocessing…" and **"P (policy): This node enables the application of policies to the output of the model node."** That is exactly our policy engine. Quote it in the report; fix "policer" | T1 |
| C5-2 | **Architecture diagram labelled with Y.3172 nodes** (SRC, C, PP, M, P, D, SINK, MLFO, ML sandbox, ML intent) | In the README, the report and an in-app "Architecture" page. Each node lists the actual file(s) implementing it (e.g. P → `src/lib/un/policy.ts`) | T1 (README/report); T2 (app) |
| C5-3 | **ML intent as an object** | The policy configuration plus each use case's requested autonomy, scope and goals, stored as a declarative `intent.json` per run and shown at T0 | T2 |
| C5-4 | **Full AI Readiness 2.0 mapping** | All 6 factors and **13 dimensions** from ITU's `simulation/data/framework/dimensions.json`, each with evidence in the product. **Close dimension 11 (inclusion):** Arabic/English UI strings for the run and dashboard pages, plus the citizen-facing scenario text in Arabic; accessibility check (WCAG AA contrast and keyboard navigation) | T2 (mapping T1) |
| C5-5 | **Use ITU's readiness engine** | Run each of the 20 use cases through ITU's `simulation/server/game` scoring (`scoring.py`) or the readiness agents (`agents/usecase.py`, `agents/sandbox.py`, …) to produce a readiness profile per use case, and show it on the use-case page. This is the strongest "built on ITU's framework" evidence | T3 |
| C5-6 | **Open source, runnable by judges** | `docker compose up` (or `npm run demo`) with local Supabase, seed data (20 use cases, KB, scenario events), deterministic mode and **no paid keys**. `.env.example` must mark OpenRouter as optional | T2 |

---

## 8. Technical report changes (5-page limit)

1. **§1 Introduction:** one-line claim, then the federal 50% context, with the deadline marked as assumed.
2. **§3 Requirements:** add the integrity requirements (I-1, I-2, I-4) as R8–R10.
3. **§4 Mappings:**
   - Quote Y.3172's P-node definition.
   - Show the full 13-dimension Readiness 2.0 table, compressed; a page-2 appendix table is acceptable within 5 pages.
4. **§5 Scenarios:**
   - Include the expected-vs-actual table for S1–S3 (and S4 if built).
   - Report model-mode accuracy (C2-7).
5. **§6 Gaps:** six categories, primary-source quotes, no "not verified here".
6. **Evaluation box:** KB recall@5 and MRR; tests passed; agent path-match %.
7. **Fix the overstated claims** (I-5); update the limits paragraph to match reality after the fixes.

---

## 9. Video: from a slide explainer to a live demo

This is required if we're shortlisted. Maximum 7 minutes.

ITU asks the video to show the hardware and software setup, the main functions, and the **expected and real outcomes of each scenario**. The current video is mostly slides, with app screenshots too small to read, and only S1 is shown.

**Recording settings:**
- Live screen recording at 1080p with browser zoom at 125–150%.
- Cursor highlight.
- Voiceover plus burned-in captions.
- Freeze-frame with a zoom on key UI elements.

**Storyboard (about 6:30):**

| Time | Segment | What's on screen |
|---|---|---|
| 0:00–0:25 | Problem | 50% target (assumed deadline labelled); "deploy is easy, proving safe is hard" |
| 0:25–0:50 | Setup | Architecture with Y.3172 nodes; stack; `docker compose up`; no paid keys |
| 0:50–1:25 | Policy and intake | Configure the policy (target, counting rule, required gates); import the 20-use-case CSV; dashboard at 0/20 |
| 1:25–2:00 | Knowledge base | Explorer: query "Where must model calls be hosted?" returns the DESC ISR quote; show recall@5 |
| 2:00–3:40 | **S1 live** | Release T0–T4 step by step; per-agent "what I know" columns; EVIDENCE_REQUEST and CHALLENGE messages; verdict changes; HITL rule breach at T2; human **Sign**; expected-vs-actual table |
| 3:40–4:20 | S2 | Sijil alert → assistant-only → complaint → new gate → re-test → supervised; expected vs actual |
| 4:20–4:55 | S3 | Federal cascade: deployed 6/20 vs compliant 4/20; policy update re-scores entities |
| 4:55–5:25 | Audit | Tamper one record → banner names the broken record; offline `verify_log` passes on the export |
| 5:25–5:55 | Gaps | Gap page: one row, UAE source silent, global primary quote |
| 5:55–6:20 | ITU alignment | Y.3172 P-node quote; Readiness 2.0 dimensions incl. inclusion (Arabic UI) |
| 6:20–6:40 | Honest limits and close | Sijil simulated (if still true); repository URL; AGPL |

---

## 10. Timeline and owners

There are two working days to submission. Split the work by what each person is best placed to do.

| When | Work | Owner |
|---|---|---|
| **Sat 8 Nov – Sun 9 Nov** | I-1 to I-6; C1-1 (DESC, Matrix PDF, Charter) and C1-2 (Y.3172, AI Ready 2025), with C1-4 cleaning and C1-5 metadata; C2-1 (S1), C2-2, C2-3, C2-8; C3-2 and C3-3 (report); C4-4 script; C5-1, C5-2 (README/report); report revisions §8 | Code: Claude (on a branch, as a pull request or patch) plus Shameer review. Report: Shaibi plus Claude |
| **Mon 10 Nov** | Merge, redeploy, smoke test, run the tests, submit (report, repo, KB). Optional: video v2 if time | Shameer (deploy, final testing and submission) |
| **11–18 Nov** | C1-3, C1-6 to C1-9; C2-4 to C2-7, C2-9, C2-10; C3-1, C3-4; C4-2, C4-5; C5-3, C5-4, C5-6; **video v3 (live demo)** | Split; video: Shameer records, Shaibi scripts |
| **19 Nov – 7 Dec** | C4-3 anchoring; C5-5 ITU readiness engine; S4 polish; onsite rehearsal (3 run-throughs, offline fallback recording) | Both |

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Model downloads blocked (Ollama, Hugging Face) in some environments | Build the embeddings on a developer machine; commit the vectors with the chunk data; BM25 fallback always on |
| Matrix PDF redistribution terms unclear | Ingest for retrieval; in the public repo, store chunk text with attribution and the source URL. If in doubt, keep only the URL and sha256 and fetch at build time |
| Merge conflicts between parallel edits | One branch per workstream; small pull requests; Shameer owns merges; freeze the main branch on 10 Nov at 12:00 GST |
| Model mode gives unstable paths | Report it honestly as a measured rate; the deterministic engine remains the decision-maker |
| The live demo fails onsite | Pre-recorded fallback; seeded local instance on a laptop; no network dependency in deterministic mode |

---

## 12. Score tracker

Tick these off as each is merged. Estimated score impact is shown in brackets.

- [ ] I-1 verdict/compliance lock (C2, C4 +0.5)
- [ ] I-2 HITL wired into verdicts (C2 +0.25; removes an overclaim)
- [ ] I-3 tests and CI (C4 +0.25)
- [ ] I-4 human signature (C4 +0.25)
- [ ] I-5 / I-6 wording, notices (credibility)
- [ ] C1-1/2 primary national + ITU documents (C1 +0.5)
- [ ] C1-4/5 cleaning and metadata (C1 +0.25)
- [ ] C1-6 hybrid vector retrieval (C1 +0.5)
- [ ] C1-7 retrieval evaluation (C1 +0.5)
- [ ] C1-9 KB explorer (C1 +0.25)
- [ ] C2-1/2 protocol exchanges and per-agent views (C2 +0.5)
- [ ] C2-3 S2 redesign (C2 +0.25)
- [ ] C2-7 model-mode accuracy (C2 +0.5)
- [ ] C2-8 expected vs actual (C2 +0.25)
- [ ] C3-1 gap page; C3-3 primary quotes (C3 +0.75)
- [ ] C4-2 append-only; C4-4 offline verifier (C4 +0.25)
- [ ] C5-1/2 Y.3172 wording and diagram (C5 +0.25)
- [ ] C5-4 13-dimension mapping and inclusion (C5 +0.5)
- [ ] C5-6 one-command local run (C5 +0.25)
- [ ] Video v3, live (all criteria at shortlist)

---

## 13. Supabase work for Shameer (branch `t1-db`)

Shaibi will **not** run the app against Supabase. Work is split by whether it needs the database:

- **Shaibi, branch `t1-fixes`:** every change that can be built and unit-tested without a database. That means the logic in `src/lib/un/*`, the tests, the knowledge-base build, the report and docs, and `scripts/verify_log.ts`. Shaibi also **writes the SQL migration file**, but does not apply it.
- **Shameer, branch `t1-db`, based on `t1-fixes`:** applies the migration to the hackathon Supabase project, finishes the wiring that touches the database, runs the end-to-end checks below, then merges and redeploys.

**Before applying anything, take a backup** of the project. In the Supabase dashboard: Database → Backups, or `pg_dump`.

### 13.1 Migration file: `supabase/migrations/20261109_t1.sql`

The table names below match the current `supabase/un-federal.sql`. Shaibi drafts the file; Shameer reviews and applies it.

```sql
-- I-1: verdicts and compliance can only come from evidence
alter table public.un_use_cases
  add column if not exists verdict_run_id      uuid references public.un_runs(id) on delete set null,
  add column if not exists verdict_head_hash   text,
  add column if not exists verdict_signed_by   uuid references public.profiles(id) on delete set null,  -- I-4
  add column if not exists verdict_signed_at   timestamptz,                                             -- I-4
  add column if not exists compliant_report_id uuid references public.un_pilot_reports(id) on delete set null;

-- Guard: the service-role key bypasses RLS, so enforce this with a trigger, not a policy.
create or replace function public.un_guard_verdict() returns trigger language plpgsql as $$
begin
  if new.verdict is distinct from old.verdict then
    if new.verdict_run_id is null or new.verdict_head_hash is null then
      raise exception 'verdict may only be set from a completed scenario run';
    end if;
    if not exists (select 1 from public.un_runs r
                   where r.id = new.verdict_run_id and r.head_hash = new.verdict_head_hash) then
      raise exception 'verdict_run_id/head_hash do not match a stored run';
    end if;
    if new.verdict_signed_by is null then
      raise exception 'verdict needs a human signature (I-4)';
    end if;
    if new.client_facing and new.verdict = 'GO_AUTONOMOUS' then
      raise exception 'client-facing use cases are capped at GO_SUPERVISED';
    end if;
  end if;
  if new.compliant and not old.compliant then
    if not exists (select 1 from public.un_pilot_reports p
                   where p.id = new.compliant_report_id and p.pass) then
      raise exception 'compliant may only be set from a passing Sijil attestation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists un_guard_verdict on public.un_use_cases;
create trigger un_guard_verdict before update on public.un_use_cases
  for each row execute function public.un_guard_verdict();
```

**Check the existing data first.** If seeded use cases already have verdicts or `compliant = true` set by hand, decide whether to:
- reset them (`update … set verdict = null, compliant = false`, applied *before* creating the trigger); or
- re-derive them by running the scenarios and attestations.

The dashboard must not show hand-set values.

### 13.2 Database-dependent tasks for Shameer (T1, by 10 Nov morning)

| Task | Plan item | What to do | Done when |
|---|---|---|---|
| D-1 | I-1 | Apply the migration. In `src/app/api/admin/un/use-cases/[id]/route.ts`, reject `verdict` and `compliant` in the PATCH body (400). Remove the editable verdict/compliant controls from the dashboard table | PATCH with `verdict` returns 400; a manual SQL `update … set verdict` without a run id fails on the trigger |
| D-2 | I-1 / I-4 | When a run finishes and a human signs, write `verdict`, `verdict_run_id`, `verdict_head_hash`, `verdict_signed_by` and `verdict_signed_at` in one update. Shaibi provides the signature record and the `signRun()` logic in `src/lib/un/runs.ts`; Shameer connects it to the route and the UI button | S1 → Sign → the use case shows GO_SUPERVISED with run and signer; the dashboard counts it |
| D-3 | I-1 | When `sijil-store.ts` files a passing report, set `compliant = true` and `compliant_report_id` in the same update | A Sijil attestation flips `compliant`; nothing else can |
| D-4 | I-2 | Load `un_hitl_rules` for the use case's entity when a run starts and pass them into `CaseState.hitlBreaches` (Shaibi provides the pure function and tests; Shameer connects the database read) | S1 T2 shows the HITL rule id in the trace; switching the rule off in HitlEditor changes the T2 reason |
| D-5 | C2-2 / C2-8 | Check the per-agent "what I know" view and the expected-vs-actual table render against real runs stored in `un_runs` | Visible on the run page for S1–S3 |
| D-6 | — | Re-seed, if needed: import `data/un-use-cases.csv`, run S1, S2 and S3 once each, sign S1, and run one Sijil attestation | The dashboard shows engine-derived numbers only |
| D-7 | — | Merge into main, redeploy, smoke test the live URL | The judges' link works with no errors in the browser console |

### 13.3 Database-dependent tasks for Shameer (T2, by 18 Nov)

| Task | Plan item | Schema change |
|---|---|---|
| D-8 | C4-2 append-only traces | `create table public.un_trace_records (run_id uuid references public.un_runs(id) on delete cascade, seq int, record jsonb not null, prev_hash text, hash text not null, created_at timestamptz default now(), primary key (run_id, seq));` plus a trigger that raises an exception on UPDATE or DELETE. Derive the run's head from the last record rather than storing it separately |
| D-9 | C1-6 vector retrieval | `create extension if not exists vector;` and `create table public.un_kb_chunks (chunk_id text primary key, source_id text, metadata jsonb, text text, embedding vector(768));` (768 is the dimension of `nomic-embed-text`), plus an RPC `match_kb_chunks(query vector(768), k int)` using cosine distance. Shaibi supplies the chunks and vectors from `kb/build.py --embed` as a load file |
| D-10 | C2-10 entity goals | `create table public.un_entities (org_id uuid references public.organizations(id) on delete cascade, name text, sector text, goals jsonb not null default '[]', primary key (org_id, name));` seeded with the 5 fictitious entities and 3–5 goals each |
| D-11 | 7.3 required gates | `alter table public.un_policy add column if not exists required_gates text[] not null default '{}';` and apply these gates in every run |
| D-12 | C5-3 ML intent | `alter table public.un_runs add column if not exists intent jsonb;` written at T0 |
| D-13 | C5-6 local run | `supabase/config.toml` plus a seed script, so `supabase start && npm run dev` works with no cloud project, for judges and for Shaibi |
| D-14 | Video v3 | Record the live demo from the deployed app (storyboard in section 9) |

### 13.4 What Shaibi hands over on Sunday evening

- **The `t1-fixes` pull request:**
  - logic changes with tests (all of `node --test "tests/*.test.ts"` green);
  - the knowledge-base rebuild (`kb/chunks.json`, `kb/sources.json`, `kb/sources.lock.json`);
  - the docs and report edits;
  - `scripts/verify_log.ts`;
  - `THIRD_PARTY_NOTICES.md`;
  - the migration file from 13.1 (**not applied**).
- **A short `docs/DB_HANDOVER.md`** listing D-1 to D-7, the functions to call (`signRun`, the HITL loader signature) and the expected results.
- **No `.env` files** and no keys in the pull request.

### 13.5 Revised 8 Nov: four items pulled forward to Monday 10 Nov

The team decided to ship these four items by submission rather than the shortlist. **This overrides the T2 timing in sections 3–7, 10 and 13.3** for these items. Everything else in T2/T3 is unchanged.

| Item | Shaibi (t1-fixes, no database) | Shameer (t1-db) | Simplification so it fits in 2 days |
|---|---|---|---|
| **Vector search** (C1-6) | Run `kb/build.py --embed` with ITU's `embed_texts` (Ollama `nomic-embed-text`, 768 dims) on a local machine and commit the vectors in `kb/vectors.json` beside `chunks.json`. In `src/lib/un/kb.ts`: embed the query at runtime with transformers.js `nomic-ai/nomic-embed-text-v1.5` (prefix `search_query: `), score cosine **in memory**, fuse with BM25 by reciprocal rank fusion, and fall back to BM25 if the model fails to load. Add the 30-question retrieval evaluation (C1-7) if time allows | Nothing for Monday | **Skip pgvector for Monday.** About 500 chunks × 768 dimensions fits in memory, so no database change is needed. pgvector (D-9) stays optional for later.<br>**Risk:** the model download and cold start on Vercel. Test on the deployed URL Monday morning. If it's slow or fails, ship BM25 with a `vector: on/off` flag and say so in the report |
| **Append-only trace table** (C4-2) | Add the `un_trace_records` table and its UPDATE/DELETE-blocking trigger to the migration file. In `runs.ts`, insert one row per trace record and derive the head hash from the last row. Keep the existing jsonb state for display. Unit-test the chain derivation | Apply the migration (with D-8); run S1 and confirm the rows appear; confirm a manual `update`/`delete` on `un_trace_records` fails | Existing runs keep their jsonb log; only new runs write rows. No backfill needed |
| **Entity goals** (C2-10) | Add `un_entities` to the migration, plus a seed with 5 entities × 3–5 goals in `supabase/seed-entities.sql`. Make Sijil "goal alignment" a documented deterministic formula: share of run actions that meet the pilot's acceptance criteria tagged to an entity goal. Show the goals on the use-case page | Apply the migration and the seed | Goals are seeded, not editable in the UI, for Monday |
| **Live-demo video** (section 9) | Write the voiceover and captions from the section 9 storyboard (trimmed to about 4 min: setup, policy and import, KB query, S1 live, S2 brief, S3 dashboard, tamper, gaps, Y.3172). Fix "policer" → "policy (P)" and label the 2028 deadline as assumed | **Record from the deployed app after the Monday merge.** Screen at 1080p, browser zoom 125–150% | If recording isn't done by the submission cut-off, the video is optional at this stage. Submit without it, or with the current video plus the two caption fixes, and record v3 for the 18 Nov shortlist |

#### Monday timeline (Dubai time)

| When | Who | What |
|---|---|---|
| Sat–Sun | Shaibi | All T1 code items from sections 2–7, plus the four rows above; one pull request with the migration file |
| **Sun 20:00** | Shaibi | Pull request ready (tests green, `kb/vectors.json` committed) |
| Sun evening | Shameer | Review; back up the database; apply the migration and seeds on `t1-db` |
| **Mon 10:00** | Shameer | Merge to main, redeploy, smoke test, including vector search on the live URL |
| Mon 10:00–14:00 | Shameer records; Shaibi checks | Live-demo video |
| Mon 12:00–16:00 | Shameer | Final testing on the live URL |
| **Mon 16:00** | Shameer | Submit (report, repository, knowledge base, video if ready) |

**Main-branch freeze: Monday 12:00.** After that, only fixes for a broken deploy go in. ITU hasn't published the deadline's time zone, so don't leave submission to the evening.
