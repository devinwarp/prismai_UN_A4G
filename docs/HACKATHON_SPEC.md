# Prism: audit and build specification for the ITU AI for Good Hackathon (UAE)

- **Prepared:** 6 November 2026
- **Submission deadline:** 10 November 2026. No time zone is stated, so plan to submit by 9 November, Dubai time.
- **Audience:** the Prism team and any AI coding assistant working on the Prism codebase.
- **Audited:** `https://prism.infinitebarakah.com/admin`, live demo workspace "Marsa Public Services Authority" (fictitious).

This document is self-contained. It covers:

1. what the hackathon requires;
2. the policy context Prism must reflect;
3. what Prism does today, as observed in the admin UI;
4. the target workflow;
5. a gap list with build specifications, data shapes and acceptance criteria;
6. a prioritised build plan for the deadline.

Statements marked **[verify]** could not be confirmed from primary sources or from the codebase and must be checked before they are relied on.

---

## 0. Instructions for the AI coding assistant

1. **Read the codebase first.** This audit was done through the admin UI only. Routes, labels and behaviours are what the UI shows; file names and the stack are unknown.
2. **Do not delete the interview (brownfield) flow.** Hide it behind a mode switch (see section 6). The UN entry runs in greenfield mode.
3. **Keep all existing pilot, gate, sign-off and Matrix scoring logic.** It is Prism's strongest asset for the entry.
4. **Use synthetic or fictitious data only.** All entity names in this document are fictitious.
5. **Make every new agent action produce a reasoning-trace record and a hash-chained audit entry** (see section 5.3).
6. **Deterministic code makes the decision; LLM agents propose and explain.** Hard gates are never averaged with anything.
7. **Build in the order given in section 9.** Stop at the "must" line if time runs out.

---

## 1. The hackathon: what must be submitted and how it is judged

**Event:** AI for Good Lab Hackathon: United Arab Emirates (ITU), https://aiforgood.itu.int/event/ai-for-good-sandbox-hackathon-united-arab-emirates/

### 1.1 Timeline

- 10 Nov 2026: submission deadline.
- 11–18 Nov: first-round evaluation.
- 18 Nov: shortlist announced.
- 8 Dec: final evaluation, onsite in Dubai during GITEX.
- 10 Dec: awards.

### 1.2 Deliverables

1. **Technical report, maximum 5 pages,** using ITU's template: https://s41721.pcdn.co/wp-content/uploads/2022/06/AI-for-Good-Sandbox-Hackathon-submission-template.docx. Required contents, per the FAQ:
   - a. a short introduction to the agentic AI solution;
   - b. a description of the use case;
   - c. the requirements of the use case;
   - d. a mapping to ITU-T Y.3172;
   - e. a mapping to the ITU AI Readiness Report 2.0.
2. **GitHub repository.** Publishing only the essential code is allowed, but the FAQ says this "might or might not" influence judging.
3. **Knowledge base of policies, regulations and strategies,** built with ITU's reference code: https://github.com/CrashingGuru/ITUAIReadiness. The page describes it as "a vectorized, distributed knowledge base hosted in the ITU AI for Good Lab", built with code to "extract, structure, and ingest data".
4. **Demo video, maximum 7 minutes.** Optional at submission; required if shortlisted. It should show the setup, the main functions, and the expected versus actual outcome of each scenario.

### 1.3 What the agents must demonstrate (from the event page)

- **Agent roles.** At least one of: innovative AI solution; policy and legal adviser; institutional participant; multi-agent coordination. For multi-agent coordination, "Inter-agent coordination protocols should orchestrate the interaction."
- **Staged error scenarios.** "Design and administer interactive error scenarios with sequenced, chunked events released progressively (not all at once)", where "information is incomplete, unevenly distributed, and received at different times by different agents."
- **Traceability.** "Implement audit logging and chain-of-thought tracing so that agent decisions, reasoning, and policy references are transparent and reviewable."

### 1.4 Judging criteria (no weights published)

| Criterion | What it rewards |
|---|---|
| Knowledge base quality | Completeness, accuracy and structure of the ingested national material; retrieval of the relevant policy context when queried |
| Agent capability | Relevance and accuracy of agent responses during the simulated error scenarios |
| Policy, strategy and standards gaps | Relevant gaps plus accurate global policy examples. The page says to focus on domain-specific gaps and relevant global examples, "rather than analysing specific geographies or country specific recommendations" |
| Auditability | Logs, reasoning traces and source attribution |
| Alignment with ITU standards | The Y.3172 pipeline and the AI Readiness Framework reflected in the architecture |

The FAQ says the accuracy of the AI prototype is not an evaluation criterion.

**Domain for our entry:** public services. **Framing:** the UAE and Dubai frameworks are the reference implementation; the gaps are framed against global practice.

**[verify]** How and where to submit is not stated on the event page. Confirm with the organisers or at the Saturday mentoring session (10:00–11:00 CEST).

---

## 2. Policy context Prism must reflect

### 2.1 UAE federal: the Agentic AI framework

- **April 2026:** the Cabinet announced a plan to run agentic AI across at least 50% of government sectors, services and operations within two years.
  - Source: https://uaecabinet.ae/en/news/under-directives-of-uae-president-and-in-world-first-mohammed-bin-rashid-reveals-new-uae-government-framework-to-deploy-agentic-ai-across-50-of-government-sectors-operations-within-two-years
- **18 May 2026:** the Cabinet adopted a framework defining the roles of each ministry and federal entity, and approved the Phase One list of federal services. The services fall into four categories: citizens, residents, business sector and general public.
  - Each entity forms a work team headed by its Minister or entity head.
  - Teams "set targets and establish assessment indicators".
  - 80,000 federal employees are to be trained.
  - Source: https://mediaoffice.ae/en/news/2026/may/18-05/mohammed-bin-rashid-chairs-uae-cabinet-meeting
- **August 2026:** a National Committee for the Agentic AI Project held its strategic workshop.
  - Seven pillars: strategy and projects; foresight and strategic intelligence; policies; structures and governance; government performance; global competitiveness; innovation in government work.
  - Guiding principle: "human leads, AI enables".
  - Source: https://aninews.in/news/world/middle-east/uae-advances-integration-of-agentic-ai-across-federal-government20260810032412/
- **Gaps in the published sources** (use these as the gap story):
  - the 50% target has no defined metric yet;
  - there are no published rules on accountability, risk, cybersecurity for agents, or citizen recourse;
  - nothing defines autonomy levels or human-oversight levels.

### 2.2 Dubai: the AI Integration Matrix Framework (Digital Dubai)

- **Whitepaper launched 28 April 2026** for Dubai government entities. Prism labels it "DDA AI Integration Matrix (v1.0, Aug 2025)".
  - Source: https://mediaoffice.ae/en/news/2026/april/28-04/digital-dubai-launches-ai-integration-matrix-framework-to-accelerate-ai-adoption-across-government
  - Local copy: `the-ai-integration-matrix-framework-1.pdf`
- **Two dimensions** (internal or external; agent or RAG) give four quadrants:
  1. **Internal Agents:** back-office automation.
  2. **Internal RAG:** knowledge assistants for staff.
  3. **External Agents:** citizen-facing services that complete tasks.
  4. **External RAG:** citizen-facing information only, with no actions.
- **Methodology (Chapter 7):**
  - Phase 1: assessment and planning (map current AI to quadrants, assess readiness, identify opportunities).
  - Phase 2: prioritisation and roadmap (multi-criteria evaluation, roadmap, risk planning).
  - Phase 3: implementation (pilots in each quadrant, iterative development, change management, integration toward agent-to-agent communication).
  - Phase 4: monitoring and optimisation (performance measurement, continuous improvement, scaling, knowledge sharing).
- **Prioritisation model (Chapter 8):**

  | Criterion | Weight |
  |---|---|
  | Impact Potential | 30% |
  | Implementation Feasibility | 25% |
  | Strategic Alignment | 20% |
  | Resource Availability | 15% |
  | Risk Assessment | 10% |

  Prism already implements these weights exactly.
- **What the Matrix does not define** (this is the gap Prism fills):
  - how much autonomy an agent may have;
  - which human-oversight level applies;
  - how deployment against a target is measured.

### 2.3 Other UAE and Dubai instruments for the knowledge base

| Instrument | Owner | Use in Prism | Source |
|---|---|---|---|
| UAE Charter for the Development and Use of AI (2024) | UAE AI Office | Principles: human oversight, transparency, accountability, privacy | https://ai.gov.ae/wp-content/uploads/2024/07/UAEAI-Methaq-EN2-3.pdf |
| National Cyber Security Policy for AI | UAE Cyber Security Council | Security gates; real-time human oversight with override | https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/policies/cyber-activities/The-National-Cyber-Security-Policy-for-Artificial-Intelligence |
| Dubai Information Security Regulation; Law No. 15 of 2024 (DESC) | Dubai Electronic Security Center | Hosting on DESC-certified cloud; security domains | https://www.desc.gov.ae/regulations/ |
| Dubai AI Seal | Digital Dubai | Vendor gate: only certified providers sell AI to Dubai government entities **[verify against a primary source]** | https://www.digitaldubai.ae/ |
| Federal Decree-Law 45 of 2021 (PDPL) | UAE Data Office | Privacy controls. Note: it largely excludes government data and health data that has its own law, so emirate-level rules usually bind entities | https://uaelegislation.gov.ae/en/legislations/1972/download |
| DFF / DCAI Agentic AI for Government Services Accelerator | Dubai Future Foundation | Context: Dubai's delivery vehicle for agentic services | https://www.dubaifuture.ae/latest-news/dubai-future-foundation-launches-agentic-ai-for-government-services-accelerator/ |

### 2.4 Global examples for the gap analysis

The judges score the accuracy of these, so cite primary texts in the knowledge base.

- **Singapore, IMDA Model AI Governance Framework for Agentic AI (January 2026):** agentic-specific governance.
  - Summary: https://www.bakermckenzie.com/en/insight/publications/2026/01/singapore-governance-framework-for-agentic-ai-launched
- **EU AI Act:** treats AI used to evaluate eligibility for essential public services and benefits as high-risk (Annex III). **[verify the exact Annex III wording]**
- **NIST AI Risk Management Framework (AI RMF 1.0)** and **ISO/IEC 42001** (AI management systems).
- **UN:** the Independent International Scientific Panel on AI (first report on 1 July 2026) and the Global Dialogue on AI Governance (Geneva, 6–7 July 2026).

---

## 3. Current Prism: observed functionality

### 3.1 Navigation and routes

| Route | Page | What it does |
|---|---|---|
| `/login?next=/admin` | Admin sign-in | "Employees don't sign in here — they use the interview link." |
| `/admin` | **Interviews** (current home) | Counters (live, not started, in progress, interviewed, documented, signed in); create interview links (one person, paste a list, CSV); campaigns; the "Sara" voice-agent status; per-employee session list; CSV and Excel export (`/api/admin/export?format=csv\|xlsx`) |
| `/admin/sessions/:id` | Interview session | Transcript and status per employee |
| `/admin/analytics` | **Analysis** ("CUBE Diagnostic") | Tabs: Diagnosis, Portfolio, Pilots & verification, Processes & SOPs, Evidence, Goals, AI Matrix. Re-run and Report menus. "Past analyses (4)" |
| `/admin/reviews` | Reviews | **Not inspected** |
| `/admin/data` | **Data quality** | Department label clean-up, interview drop-off funnel, "concrete examples" check |
| `/admin/setup` | **Workspace setup** | "Tell Sara about [entity]" context form (industry, size, what the company does, what you hope to learn from interviews, competitors, pain areas); interview branding; recording playback toggle; team (admins and viewers); delete workspace |

### 3.2 Analysis tabs (demo data: 44 interviews, 13 processes, 10 initiatives)

- **Diagnosis:**
  - a problem summary;
  - "What's broken", with evidence counts;
  - places where work is done twice; key-person risks; data gaps;
  - quick wins; insights;
  - AI maturity on six 0–5 dimensions (data, process documentation, tools, skills, automation, governance);
  - decisions needed from management;
  - Stage 1 ask with costs, and checkpoint criteria;
  - department coverage.
- **Portfolio:**
  - use cases underwritten like investments. Weights: net value 35%, feasibility 25%, effort and run cost 15%, reuse 15%, trust exposure 10%;
  - a named owner per use case;
  - hard stops: no owner willing to sign, no credible baseline, prohibited risk, data not lawfully usable, process about to change;
  - rejected list ("rejection is a feature");
  - the CUBE method: 7 stages over 13 weeks;
  - a Day-90 portfolio with a configure, buy or commission position for each item;
  - transfer readiness by function.
- **Pilots & verification:**
  - pipeline per pilot: baseline → test → live → measuring (0/4 weeks) → decide and sign → solid?
  - Matrix Performance CSV; scorecards; a verified ledger (cash saved, capacity redeployed, net per year).
  - The expanded pilot ("Renewal pre-check and Ejari bounce follow-up", verdict **SUPERVISED · SOLID**) shows:
    - a scorecard text describing the human-in-the-loop arrangement ("An officer opens every file and releases every customer message");
    - **5 hard gates**, for example "Acts only within read-only permissions", "Customer told they are interacting with an assistant", "Every action written to the audit log", "Model calls and data stay on DDA-approved infrastructure";
    - **3 weighted measures** with thresholds, for example "Pre-check agrees with the officer's own check ≥ 95%", latest 96.8%;
    - baseline periods (hours, errors, source) and outcome metrics;
    - an acceptance plan: scope, exclusions, operating conditions, escalation, primary and supporting Matrix capability;
    - **approver roles:** process owner (required), frontline representative, IT/integration, security, privacy/legal, compliance, finance. Each signs with a timestamp and an optional comment;
    - a criteria editor: hard gate or weighted measure; category (outcome, NFR, safety, privacy, security, compliance); unit; direction; threshold; evidence; sample;
    - a test-stage scenario register: standard scenarios (full outage, retry or duplicate, wrong person or record, out-of-scope question, connected system fails …), each with an expected behaviour, PASS/FAIL, a timestamp and a review note. There are actions to "Suggest from interviews", "Add standard scenarios" and settle "open items".
- **Processes & SOPs:**
  - SOP pack (company-wide or per department; PDF or Markdown);
  - process catalogue with roles, departments, hours per week, confidence, "contested" or "single account" flags, and a recommendation (AI-enhanced, make agentic, automate);
  - redundant work (duplicate steps, re-entry, handoffs); tools in play.
- **Evidence:** not inspected in detail.
- **Goals:** "Goal impact map". **Empty** in the demo.
- **AI Matrix:**
  - scored against the DDA AI Integration Matrix with weights 30/25/20/15/10;
  - initiatives grouped by quadrant;
  - a weighted score for each, with a "why";
  - a phase 1/2/3 threshold and a roadmap;
  - CSV export.

### 3.3 Strengths to keep and showcase

- A faithful implementation of the Matrix prioritisation model.
- Investment-style underwriting with hard stops and explicit rejections.
- A pilot lifecycle with **hard gates never averaged**, weighted measures, multi-role sign-off and a verified ledger.
- An existing scenario register, which is the base for the staged scenarios.
- An existing "every action written to the audit log" gate, which is the base for traces.
- **Human-oversight verdicts already exist** ("Supervised"; "one failed gate rules out Autonomous and Supervised"; "assistant-only pilot: the agent prepares, a person acts").

---

## 4. Target workflow for the UN entry

Greenfield mode is the default for the entry; brownfield mode is the interview flow.

```
[Policy configuration]  federal policy + target % + deadline (e.g., UAE: 50% in 24 months)
        │ cascades to
[Entities]  government entities (fictitious) ── each with goals
        │
1. USE-CASE INTAKE  (greenfield)  list of large AI use cases mapped to entities, tagged to Matrix quadrant
        │                          (brownfield alternative: interviews → SOPs, existing flow)
2. SOP UPLOAD       per department / business process
        │
3. ORG DESIGN AGENT department → org chart → job positions → roles & responsibilities → RACI per process
        │            + information-security and business risks per position, aligned to entity goals
        │            + human-in-the-loop rules (e.g., any client-facing output needs human final approval)
4. OPPORTUNITY SCOUT agentic opportunities per process/position → Matrix scoring (existing) → portfolio (existing)
        │
5. PILOT (Phase II) existing pilot lifecycle + Sijil runs: inference accuracy, hallucination rate, goal alignment,
        │            rejects per criterion, live metrics over N runs → auto-filed pilot report
6. APPROVAL & DEPLOYMENT  owner signs (existing) → RACI updated → agent added to org chart as a workforce member
        │            → supervising human's role enlarged + training recorded → SOP versioned and updated by the agent
7. PRODUCTION WATCHDOG  live monitoring per deployed agent (Sijil), drift and incidents
        │
[Federal dashboard]  % of use cases deployed vs target; % compliant and goal-aligned (Sijil attestation)
```

---

## 5. Hackathon-specific additions (highest priority)

### 5.1 Knowledge base built with ITU's reference code

- **Goal:** a vectorised knowledge base of the national and Dubai policy material, plus the global benchmarks. Agents retrieve from it and cite it.
- **Reference code:** `https://github.com/CrashingGuru/ITUAIReadiness`. Its README says only "code for training for ITU AI Readiness". It contains a `simulation/` folder and `Colab Free Tier LLM Notebook.ipynb`.
  - **[verify]** This audit could not open those files. **Clone the repository, read the notebook and `simulation/`, and use its extraction, chunking and ingestion pipeline as-is.** If it defines a schema, it overrides the suggestion below.
  - **[verify]** Check whether ITU expects the knowledge base to be uploaded to the AI for Good Lab, or only included in the repository.
- **Sources to ingest:** sections 2.1–2.4.
  - National: Cabinet framework releases (April and May 2026); the AI Integration Matrix PDF; the UAE AI Charter; the National Cyber Security Policy for AI; the DESC ISR summary; PDPL; the DFF/DCAI accelerator page.
  - Global: the Singapore agentic framework; EU AI Act Annex III; NIST AI RMF; ISO/IEC 42001 (abstract or summary only, since the standard is paywalled).
- **Suggested chunk metadata** (use only if the ITU code doesn't define one):

```json
{
  "chunk_id": "uae-cabinet-2026-05-18#p3",
  "source_title": "UAE Cabinet meeting, 18 May 2026",
  "source_url": "https://mediaoffice.ae/...",
  "issuer": "UAE Cabinet",
  "jurisdiction": "UAE-federal",          // UAE-federal | Dubai | Singapore | EU | international
  "instrument_type": "framework",          // law | regulation | policy | framework | standard | guidance | press-release
  "binding": false,
  "date": "2026-05-18",
  "version": "1",
  "section": "Phase One services",
  "matrix_quadrants": ["External Agents"],  // optional tagging
  "topics": ["targets", "governance", "human-oversight"],
  "text": "...",
  "sha256": "..."                          // hash of the source file for provenance
}
```

- **Acceptance criteria:**
  - every source has its URL, date and SHA-256;
  - a query such as "Which human oversight is required for citizen-facing agents?" returns cited chunks from the UAE and global sources;
  - the knowledge base can be rebuilt from a script in the repository.

### 5.2 Staged error scenarios: facts in chunks, to different agents, over time

- **What exists:** the test-stage scenario register runs each scenario in one go with PASS/FAIL.
- **What to build:** a **scenario engine** that releases events on a timeline (T0, T1, …). Each event goes to a subset of agents, so each agent sees part of the picture. Agents must update their positions as facts arrive. The coordinator reconciles them and the policy engine produces a verdict at each step.
- **Event schema:**

```json
{
  "scenario_id": "S2-voice-contact-centre",
  "step": "T2",
  "released_at": "2026-11-08T10:00:05Z",
  "recipients": ["compliance_agent"],          // uneven distribution is the point
  "event_type": "sijil_alert",                 // policy_update | evidence | incident | complaint | sijil_alert | owner_input
  "payload": { "metric": "hallucination_rate", "value": 0.041, "threshold": 0.01, "context": "fee amounts quoted to callers" },
  "kb_refs": ["uae-ai-charter#transparency"]
}
```

- **Verdict scale** (reuse Prism's existing language): `GO_AUTONOMOUS` | `GO_SUPERVISED` | `ASSISTANT_ONLY` | `NO_GO` | `ESCALATE`. One failed hard gate rules out `GO_AUTONOMOUS` and `GO_SUPERVISED`, as Prism already does.
- **Minimum scenarios for the submission:** 3. Each needs an expected verdict path, so the video can show expected versus actual.

| ID | Use case (see Appendix A) | T0 | T1 | T2 | T3 | Expected path |
|---|---|---|---|---|---|---|
| S1 | UC02 Trade licence renewal pre-check (Marsa PSA). Reuses the verified pilot | Owner proposes `GO_AUTONOMOUS`; process owner and frontline agents receive the baseline and pilot results | **Security agent only:** the model endpoint is not on DESC-certified infrastructure | **Compliance agent only:** the agent sends customer messages directly (breaks the client-facing human-in-the-loop rule) | Owner moves the model to approved hosting and restores officer release. **T4:** re-test of both fixed gates passes | T0 `ESCALATE` (autonomy requested above the client-facing cap; two gates have no evidence) → T1 `NO_GO` (hosting gate fails) → T2 `NO_GO` (second gate fails: HITL) → T3 `ASSISTANT_ONLY` (fixes declared, not yet re-tested) → T4 `GO_SUPERVISED` (the ceiling for a client-facing case; never autonomous) |
| S2 | UC01 AI voice contact centre (Marsa PSA) | Pilot live; Sijil metrics within thresholds | **Compliance agent only:** Sijil alert, hallucination rate on quoted fees is above threshold | **Customer-happiness / complaints agent only:** a citizen complaint about a wrong fee | **Policy adviser only:** the knowledge base surfaces a transparency requirement (callers must be told it's AI) | `GO_SUPERVISED` → `ASSISTANT_ONLY` (fee answers restricted to a retrieved fee table, human callback) → re-test → `GO_SUPERVISED` with an added gate |
| S3 | Federal cascade, 20 use cases across 5 entities | Policy configured at 50%; dashboard shows the target as 10 of 20 | **Federal coordinator only:** an entity reports 6 use cases deployed | **Compliance agent only:** 2 of the 6 fail Sijil attestation this week | **Policy adviser only:** a mid-run policy update (simulated: a new Phase One service category added) | Deployed 6/20 (30%); compliant 4/20 (20%); target gap flagged; affected entities re-scored |

- **Acceptance criteria:**
  - events are released on a timer or by a "next step" button, never all at once;
  - each agent's view lists only the events it received;
  - each step produces a verdict and a reasoning trace;
  - a run can be replayed from its log.

### 5.3 Agent reasoning traces (beyond the audit-log gate)

- **What exists:** the hard gate "Every action written to the audit log".
- **What to build:** for every agent turn, a structured **reasoning-trace record**, written to an append-only, hash-chained log.
  - Store a concise rationale, not raw hidden model reasoning: the claim, the evidence used, the knowledge-base citations, and the decision proposed.

```json
{
  "trace_id": "tr_000123",
  "run_id": "S2-run-04",
  "step": "T2",
  "agent": "compliance_agent",
  "role_mandate": "Checks agent behaviour against UAE AI Charter transparency/accountability and entity HITL rules",
  "inputs_seen": ["evt_T2_sijil_alert"],
  "claims": [
    { "text": "Hallucination rate 4.1% exceeds 1% threshold on fee answers", "evidence": ["sijil:run-04/metric/hallucination_rate"] }
  ],
  "kb_citations": [{ "chunk_id": "uae-ai-charter#human-oversight", "quote": "<short verbatim excerpt>" }],
  "proposal": "ASSISTANT_ONLY",
  "confidence": "medium",
  "timestamp": "2026-11-08T10:00:07Z",
  "prev_hash": "ab12…",
  "hash": "cd34…"            // sha256(prev_hash + canonical_json(record without hash))
}
```

- **Verifier:** a script (`verify_log`) that recomputes the chain and reports any break.
- **Citation gate:** the policy engine rejects any agent claim that cites no evidence or knowledge-base chunk ("uncited claims rejected").
- **UI:** a trace viewer per run, as a timeline of steps, filterable by agent, showing citations and verdicts.
- **Acceptance criteria:**
  - every verdict links to the traces that produced it;
  - the verifier passes on a clean log and fails on a tampered one (include that test in the repository).

### 5.4 Approver roles played as agents (multi-agent)

- **What exists:** seven human approver roles that sign (process owner, frontline representative, IT/integration, security, privacy/legal, compliance, finance).
- **What to build:** an **AI agent for each role** that reviews the use case and pilot evidence within its mandate and proposes sign or withhold with reasons. **The human still signs.** The agent's output is shown beside the signature box.
- Add two hackathon roles:
  - an **innovator / applicant agent**, which represents the entity proposing the use case;
  - a **coordinator agent**, which runs the protocol.

| Agent | Mandate | Main knowledge-base sources | Typical gate or measure it owns |
|---|---|---|---|
| Innovator (applicant) | Proposes the use case, autonomy level and benefits | Matrix, entity goals | Benefit case, scope |
| Policy & legal adviser | Maps the use case to UAE, Dubai and global obligations | Cabinet framework, Charter, PDPL, EU AI Act, Singapore framework | Legal basis, prohibited uses |
| Security (institutional) | Hosting, access and adversarial robustness | National Cyber Security Policy for AI, DESC ISR | "Model calls stay on approved infrastructure", "hijack" (prompt-injection) test |
| Privacy / legal | Data minimisation, lawful use, redaction | PDPL, emirate data rules | "Data lawfully usable" hard stop |
| Compliance | Human-in-the-loop rules, transparency, Sijil attestation | Charter, entity HITL rules | "Customer told it's an assistant", HITL gate |
| Frontline representative | Workability, exceptions, workload | SOPs, RACI | Officer handling time |
| Finance | Net value, cost to run | Portfolio data | Verified ledger |
| Coordinator | Protocol: request, propose, challenge, reconcile, verdict | All | Runs the policy engine; writes the log |

- **Coordination protocol messages:** `PROPOSE`, `CHALLENGE`, `EVIDENCE_REQUEST`, `EVIDENCE`, `POSITION_UPDATE`, `ESCALATE`, `VERDICT`.

```json
{ "msg_id": "m_45", "from": "security_agent", "to": ["coordinator"], "type": "CHALLENGE",
  "re": "UC02", "gate": "approved_infrastructure", "reason": "Endpoint region not DESC-certified",
  "evidence": ["evt_T1_hosting_report"], "kb": ["desc-isr#hosting"] }
```

- **Acceptance criteria:**
  - at least 5 role agents active in S1–S3;
  - each agent only sees the events routed to it;
  - disagreements are visible and resolved by the coordinator plus the deterministic policy engine;
  - humans sign the final decision.

### 5.5 Y.3172 mapping (for the report and the architecture diagram)

ITU-T Y.3172 is the "architectural framework for machine learning in future networks including IMT-2020". The node names below are as commonly cited; **[verify] against the Recommendation text before submission.**

| Y.3172 element | Prism component |
|---|---|
| SRC (source) | Policy sources (section 2) pinned by SHA-256; use-case list; uploaded SOPs; Sijil telemetry |
| C (collector) | Ingestion: ITU reference pipeline, use-case CSV import, SOP upload, Sijil connector |
| PP (pre-processor) | Clause chunking and metadata; SOP parsing into processes; Matrix quadrant tagging |
| M (model) | LLM role agents (section 5.4) plus retrieval over the knowledge base |
| P (policy) | Deterministic policy engine: hard gates, weighted measures, human-in-the-loop rules, verdict scale |
| D (distributor) | Decision memo, pilot report, RACI and SOP updates, dashboard |
| SINK | Hash-chained audit and trace log; verified ledger; Matrix Performance export |
| MLFO (ML function orchestrator) | Coordinator agent and scenario engine |
| ML sandbox | Pilot and test stage, where scenarios run on synthetic data before go-live |
| ML intent | The configured policy target plus each use case's declared intent (scope, autonomy level requested, goals) |

### 5.6 ITU AI Readiness mapping (for the report)

The six factors below are from version 1.0. **[verify]** The hackathon asks for Report 2.0; check its factors.

| Factor | Prism evidence |
|---|---|
| Open data availability | Open knowledge base; synthetic use-case dataset (Appendix A) |
| Access to research | Global benchmarks cited in the gap register |
| Deployment capability and infrastructure | Hosting gate on approved infrastructure; configure/buy/commission positions |
| Stakeholder buy-in (standards for trust, interoperability, security) | Multi-role sign-off; hard gates; Matrix as a shared language |
| Developer ecosystem (open source) | GitHub repository (scope to be decided) |
| Sandbox pilots | Pilot lifecycle plus the staged scenario engine; link to DFF's AI Sandbox as the real-world route |

---

## 6. Remove or hide for the UN entry

Add a workspace-level setting: `mode = greenfield | brownfield`. The UN demo workspace uses `greenfield`. Brownfield keeps everything as it is today.

| Item | Where seen | Action in greenfield mode |
|---|---|---|
| Interviews as the admin home | `/admin` ("INTERVIEWS · Who's been mapped", create interview links, campaigns, session list) | Make **Use cases** the landing page at `/admin`, and move Interviews to `/admin/interviews` (hidden in greenfield) |
| Sara voice-agent wording | `/admin` ("Sara — voice agent … Recreate"); `/admin/setup` ("Tell Sara about …", "This context goes into every interview — Sara asks sharper questions…", "WHAT ARE YOU HOPING TO LEARN FROM THESE INTERVIEWS?", interview branding, interview recordings) | Replace with an **Entity profile** form (sector, mandate, goals, risk appetite, policy target); hide the interview branding and recordings sections |
| Interview metrics | `/admin/data` ("Interview drop-off", "Concrete examples", "workflows without an example") | Hide in greenfield; keep the department clean-up |
| Interview-derived labels | Analysis: "44 EVIDENCE interviews", "RAISED BY 8 PEOPLE", "No interview from …", "Suggest from interviews" | In greenfield, the evidence source is the **uploaded SOPs and the use-case list**. Relabel to "sources", and replace "Suggest from interviews" with "Suggest from SOPs" |
| Employee login hint | `/login` ("Employees don't sign in here — they use the interview link") | Hide in greenfield |

---

## 7. Workflow gaps: build specifications

Status: **E** = exists, **P** = partial, **M** = missing.

| # | Capability | Status | Build |
|---|---|---|---|
| 7.1 | Start mode and use-case intake | M | Greenfield/brownfield switch (section 6). Use-case import by CSV or form, using the columns of `prism-un-entry-use-cases.csv` (Appendix A): `id, entity, entity_sector, use_case, quadrant, matrix_examples_bundled, departments_in_scope, client_facing, human_in_the_loop_rule, description`. Each row creates a use case linked to an entity, with its quadrant pre-set |
| 7.2 | Multiple entities and the federal level | M | Today one workspace equals one entity. Add an `Entity` object and a **federal workspace** containing several entities. Simplest path: a parent workspace that rolls up child workspaces |
| 7.3 | Policy configuration and cascade | M | A panel at the top of the federal workspace: `policy_name`, `jurisdiction`, `source_url`, `target_percent` (e.g. 50), `deadline`, `counting_rule` (see 7.11), `allowed_verdicts_that_count` (default: `GO_AUTONOMOUS`, `GO_SUPERVISED`), plus required gates added to every pilot (e.g. "approved infrastructure", "citizen told it is AI"). On save, it cascades targets to entities and use cases. Changing the policy, e.g. loading another country's, re-targets everything. **This is the "generic system" demonstration** |
| 7.4 | Entity goals | P | The Goals tab exists but is empty. Make goals part of the entity profile (3–5 measurable goals); the alignment metric in 7.9 uses them |
| 7.5 | SOP upload | M | Upload PDF, DOCX or Markdown per department or process. Parse it into processes, steps, roles and tools (reuse the SOP pack structure the interview path produces). Keep version 1 for later updates |
| 7.6 | Org design agent: org chart, positions, roles and responsibilities, RACI | P | From the uploaded SOPs, generate for each department: (a) org chart (positions, reporting lines); (b) a job card per position: purpose, responsibilities, KPIs, systems used; (c) a **RACI matrix per process step** (positions × steps: R/A/C/I); (d) **information-security and business risks per position**, tagged to entity goals. Show this as a new tab "Organisation". Each output is a reviewable draft with a trace |
| 7.7 | Human-in-the-loop rule engine | P | Today it's per-pilot free text. Add entity-level rules evaluated automatically. Examples: `IF quadrant in [External Agents, External RAG] OR output_audience == "customer" THEN require human_final_approval`; `IF decision affects rights/fees/eligibility THEN require human_decision`; `IF action irreversible THEN require human_approval`. EPC example: "engineering drawing to client → human final approval". A rule breach is a **hard gate failure** |
| 7.8 | Opportunity scout | E (interview-based) | Point the existing analysis at SOPs plus org data in greenfield mode. Output stays the same: Matrix-scored initiatives, portfolio and roadmap |
| 7.9 | Pilot with Sijil runs | M | Add a **Sijil panel** to each pilot: number of runs; live metrics per run (**inference accuracy**, **hallucination rate**, **goal alignment** against entity goals and the pilot's acceptance criteria); **rejects per criterion** (Sijil counts each action that fails a Prism criterion as a reject). On completion, **auto-file a pilot report** (PDF or Markdown) for the owner. **[verify]** The Sijil API is unknown. If it isn't ready, ship a mock adapter with the same interface and label it "Sijil (simulated)" in the demo |
| 7.10 | Approval leads to workforce change | P | Sign-off exists. On approval: (a) update the RACI (the agent becomes R for its steps; the supervising human becomes A or is given a review step); (b) add the **agent to the org chart** as a workforce member with its own job card (mandate, limits, HITL rules); (c) **enlarge the supervisor's role**, adding "supervises agent X" to their job card and recording training required and completed |
| 7.11 | SOP auto-update | M | Each deployment creates a new SOP version (diff shown). It is generated within the agent's goals and the approved RACI, and must be approved by the process owner before it becomes current |
| 7.12 | Production watchdog | M | Per deployed agent: live Sijil metrics, reject trend per criterion, incidents, drift alerts (when thresholds are breached, a downgrade verdict is proposed). Federal view: list of all deployed agents, with a red/amber/green status |
| 7.13 | Federal dashboard | M | Headline cards: **Target** (e.g. 50% → 10 of 20); **Deployed %** = use cases whose verdict counts (default `GO_AUTONOMOUS` or `GO_SUPERVISED`) ÷ total use cases in scope; **Compliant & aligned %** = deployed use cases whose latest Sijil attestation passes all hard gates and meets alignment thresholds ÷ total use cases. Breakdowns by entity, quadrant and stage (intake → SOP → org → scout → pilot → approved → deployed). **Counting rule must be explicit and configurable**, because the federal framework has not yet defined the metric (that's one of our gaps) |

### 7.14 Suggested data model additions

```text
Policy(id, name, jurisdiction, source_url, target_percent, deadline, counting_rule, required_gates[])
Entity(id, federal_workspace_id, name, sector, mandate, goals[], hitl_rules[], risk_appetite)
UseCase(id, entity_id, title, quadrant, matrix_examples[], departments[], client_facing, hitl_rule, stage, verdict)
Department(id, entity_id, name)
SOP(id, department_id, version, file_ref, parsed_processes[], status: draft|current|superseded)
Position(id, department_id, title, reports_to, is_agent:boolean, job_card{purpose,responsibilities[],kpis[],systems[]}, risks[])
RACI(process_id, step_id, position_id, role: R|A|C|I)
Pilot(existing) + sijil_runs[] + report_ref
SijilRun(id, pilot_id, run_no, accuracy, hallucination_rate, goal_alignment, rejects{criterion_id:count}, timestamp)
ScenarioRun(id, scenario_id, events[], verdicts[], trace_ids[])
TraceRecord(section 5.3)
AgentMessage(section 5.4)
```

---

## 8. Demo script (7-minute video and onsite final)

1. **Policy configuration** (30 seconds): load "UAE Federal Agentic AI framework, target 50%". Briefly swap in another jurisdiction's policy to show it's generic, then switch back.
2. **Intake** (30 seconds): import the 20 use cases (Appendix A) across 5 fictitious entities. The dashboard shows 0/20 against the 10/20 target.
3. **SOP to organisation** (60 seconds): upload the Licensing SOP for Marsa PSA. Show the org chart, job cards, RACI, risks and the human-in-the-loop rules applied automatically.
4. **Scout and Matrix** (30 seconds): show the Matrix scores and roadmap (existing).
5. **Staged scenario S1** (2 minutes): events arrive to different agents; the agents disagree; the verdict changes at each step; the trace viewer shows the citations; a human signs.
6. **Pilot with Sijil** (60 seconds): runs, metrics, the auto-filed report, then approval. The RACI updates, the agent appears in the org chart, and the supervisor's role is updated.
7. **Watchdog and dashboard** (60 seconds): S2 or S3 in brief. A drift alert leads to a downgrade, and the dashboard shows deployed and compliant percentages.
8. **Close:** the gap register, comparing the UAE reference implementation with global examples.

---

## 9. Build plan to 10 November (priority order)

**Must (submission):**

1. Greenfield mode, plus hiding the interview elements (section 6).
2. Use-case CSV import and the entity object (7.1, 7.2). A minimal federal roll-up is enough.
3. Policy configuration and the federal dashboard with both percentages (7.3, 7.13).
4. Knowledge base via the ITU reference code, plus retrieval with citations (5.1).
5. Role agents and the coordinator protocol (5.4).
6. Scenario engine with S1 and S3 at minimum (5.2).
7. Reasoning traces, the hash-chained log and the verifier (5.3).
8. Human-in-the-loop rule engine as a hard gate (7.7).
9. Sijil panel. A simulated adapter is acceptable if the real API isn't ready (7.9).
10. Technical report (5 pages): the Y.3172 and AI Readiness tables from sections 5.5–5.6; the gap register; the architecture.

**Should (before the shortlist on 18 November):** SOP upload and the org design agent with RACI (7.5, 7.6); scenario S2; the auto-filed pilot report.

**Could (before the final on 8 December):** workforce change on approval (7.10); SOP auto-update (7.11); the watchdog (7.12); the demo video polish.

---

## 10. Gap register for the report

Frame these against global practice; the UAE and Dubai frameworks are the reference implementation.

| Gap category | Gap | Global example | Prism response |
|---|---|---|---|
| Unclear responsibilities | Who may approve an agent going live, and who is accountable once it acts | Singapore's agentic AI framework assigns accountability across the agent lifecycle **[verify wording]** | Named approver roles, plus role agents, plus signed verdicts |
| Standards | No defined autonomy or oversight levels for agents | EU AI Act human-oversight obligations for high-risk AI | Verdict scale (autonomous, supervised, assistant-only, no-go) plus HITL rules as hard gates |
| Technology | No standard way to measure agent hallucination or goal alignment in production | NIST AI RMF "Measure" function | Sijil attestation plus watchdog |
| Legislative | Citizen recourse against agent decisions is not set out in the published federal framework | EU AI Act; GDPR Art. 22 on automated decisions **[verify]** | HITL rule: decisions affecting rights need a human; complaint events in scenarios |
| Coordination | The 50% target has no published counting rule; entities may count differently | (no direct equivalent; note this) | Configurable, explicit counting rule on the federal dashboard |
| Conflicting objectives | Speed to 50% versus safety and compliance | Singapore framework's risk-based approach | Hard gates are never averaged; "compliant %" is reported beside "deployed %" |

---

## 11. Open questions and assumptions

- **Codebase:** the stack, file layout and Reviews page were not seen. The coding assistant should map this specification onto the real code.
- **ITU reference code:** not inspected (access was blocked). Clone and follow it; it may define the knowledge-base format.
- **Sijil:** API and metric definitions unknown. Confirm which events count as a reject, and whether Sijil blocks actions or only records them.
- **Open-source scope:** which Prism parts go public on GitHub. The judges may weigh this.
- **Submission channel and time zone:** not stated by ITU. Confirm.
- **AI Readiness:** Report 2.0's factors may differ from v1.0's six.
- **Use-case labels:** in Appendix A, "Policy and procedure assistant" is a label chosen for the Matrix's first Internal RAG example, whose title was lost in PDF text extraction. Check page 37 of the PDF.

---

## Appendix A: use-case dataset (summary)

The full file is `prism-un-entry-use-cases.csv`. It has 20 rows, with columns as in 7.1.

- **Quadrant mix:** 8 internal agents, 5 external agents, 3 internal RAG, 4 external RAG.
- **Human-in-the-loop:** 10 rows are client-facing (one only partly) and carry human-final-approval rules.

| ID | Entity (fictitious) | Use case | Quadrant |
|---|---|---|---|
| UC01 | Marsa Public Services Authority | AI voice contact centre for licensing and permits | External Agents |
| UC02 | Marsa Public Services Authority | Trade licence renewal and permit pre-check | External Agents |
| UC03 | Marsa Public Services Authority | Inspection findings and violation processing | Internal Agents |
| UC04 | Marsa Public Services Authority | Regulations and procedures assistant for officers | Internal RAG |
| UC05 | Wahat Health Services Authority | Patient appointment and service navigation agent | External Agents |
| UC06 | Wahat Health Services Authority | Invoice processing and procurement automation | Internal Agents |
| UC07 | Wahat Health Services Authority | Clinical policy and procedure assistant for staff | Internal RAG |
| UC08 | Wahat Health Services Authority | Public health information portal | External RAG |
| UC09 | Sahel Federal Workforce Agency | Recruitment and onboarding agent | Internal Agents |
| UC10 | Sahel Federal Workforce Agency | Employee self-service HR assistant | Internal RAG |
| UC11 | Sahel Federal Workforce Agency | Performance review and workforce planning support | Internal Agents |
| UC12 | Sahel Federal Workforce Agency | Jobseeker and applicant guidance portal | External RAG |
| UC13 | Qanat Transport and Mobility Agency | Citizen mobility and fines assistant | External Agents |
| UC14 | Qanat Transport and Mobility Agency | Fleet and asset predictive maintenance | Internal Agents |
| UC15 | Qanat Transport and Mobility Agency | Incident and crisis response coordination | Internal Agents |
| UC16 | Qanat Transport and Mobility Agency | Traffic rules and permits information service | External RAG |
| UC17 | Raya Education and Skills Council | School enrolment and scholarship assistant | External Agents |
| UC18 | Raya Education and Skills Council | Legal and regulatory update monitoring | Internal Agents |
| UC19 | Raya Education and Skills Council | IT service desk and operations agent | Internal Agents |
| UC20 | Raya Education and Skills Council | Education policy and rights information service | External RAG |

Each row bundles named examples from the Matrix PDF. For instance, UC01 combines the Status Tracking Agent, the Multi-Language Assistant and the Personalized Service Navigator, and UC06 combines the Invoice Processing Agent, the Procurement Optimizer and the Budget Anomaly Detector.

## Appendix B: sources

- ITU hackathon page: https://aiforgood.itu.int/event/ai-for-good-sandbox-hackathon-united-arab-emirates/
- ITU reference code: https://github.com/CrashingGuru/ITUAIReadiness
- ITU AI Readiness v1.0: https://aiforgood.itu.int/reports_publications/ai-ready-analysis-towards-a-standardized-readiness-framework-version-1-0/
- UAE Cabinet, 50% agentic AI: https://uaecabinet.ae/en/news/under-directives-of-uae-president-and-in-world-first-mohammed-bin-rashid-reveals-new-uae-government-framework-to-deploy-agentic-ai-across-50-of-government-sectors-operations-within-two-years
- Cabinet meeting, 18 May 2026: https://mediaoffice.ae/en/news/2026/may/18-05/mohammed-bin-rashid-chairs-uae-cabinet-meeting
- Agentic AI workshop (ANI/WAM): https://aninews.in/news/world/middle-east/uae-advances-integration-of-agentic-ai-across-federal-government20260810032412/
- Digital Dubai AI Integration Matrix launch: https://mediaoffice.ae/en/news/2026/april/28-04/digital-dubai-launches-ai-integration-matrix-framework-to-accelerate-ai-adoption-across-government
- UAE AI Charter: https://ai.gov.ae/wp-content/uploads/2024/07/UAEAI-Methaq-EN2-3.pdf
- National Cyber Security Policy for AI: https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/policies/cyber-activities/The-National-Cyber-Security-Policy-for-Artificial-Intelligence
- DESC regulations: https://www.desc.gov.ae/regulations/
- PDPL scope (Clyde & Co): https://www.clydeco.com/en/insights/2021/11/uae-issues-landmark-personal-data-protection-law
- DFF agentic AI accelerator: https://www.dubaifuture.ae/latest-news/dubai-future-foundation-launches-agentic-ai-for-government-services-accelerator/
- DFF AI Sandbox (28 Oct 2026): https://techafricanews.com/2026/10/28/dubai-future-foundation-launches-ai-sandbox-to-help-companies-navigate-regulation/
- Singapore agentic AI framework (summary): https://www.bakermckenzie.com/en/insight/publications/2026/01/singapore-governance-framework-for-agentic-ai-launched
- UN AI Global Dialogue: https://news.un.org/en/story/2026/07/1167862
