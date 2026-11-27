# SOP-REG-001: Regulations and procedures help desk for officers

> **Fictitious document.** Marsa Public Services Authority, its regulations, circulars, systems and staff titles are invented for demonstration. Nothing here describes a real authority or real law.

| Field | Value |
|---|---|
| Document id | SOP-REG-001 |
| Version | 1.0 (synthetic) |
| Owner | Director of Regulatory Procedures, Marsa Public Services Authority |
| Related use case | UC04: Regulations and procedures assistant for officers |
| Applies to | Answering licensing and inspection officers' questions about Marsa regulations, SOPs and circulars, and keeping the Procedures Library that the answers come from |
| Review cycle | Every 12 months |

## 1. Purpose

Give every licensing and inspection officer a fast, correct answer to "what does the rule say?", taken from the current official text and cited so the officer can check it. Keep the Procedures Library complete and current so the answers stay right. The help desk explains the rules; it never decides a case. The officer who owns a case remains responsible for applying the rule.

## 2. Scope

**In scope:** questions from Marsa licensing and inspection staff about regulations, SOPs, circulars, fee schedules and activity codes; the Procedures Library (adding, reviewing, publishing and retiring sources); knowledge gaps and conflicts between sources.

**Out of scope:** questions from the public (SOP-LCC-002); decisions on a specific case (the case's own SOP); legal opinions on disputes or litigation (Legal Affairs); drafting new regulations (SOP-REG-009).

## 3. Roles

Four job profiles carry out this procedure. Each has a distinct purpose, a fixed set of tasks and its own limits.

### 3.1 Procedures Help Desk Officer
- **Purpose:** answer officers' questions from the Procedures Library, with a citation for every rule stated.
- **Works with:** licensing and inspection officers (chat and email), the Regulatory Procedures Officer.
- **Authority:** may search the library and answer from published sources. May not answer from memory or unpublished drafts, give a decision on a case, or change the library.
- **Skills:** reading regulations precisely, the citation format (section 6.2), plain writing in Arabic and English.

### 3.2 Regulatory Procedures Officer
- **Purpose:** keep the Procedures Library complete, current and consistent.
- **Works with:** source owners (heads of department), the Legal Reviewer, the Director.
- **Authority:** may prepare sources for publication, record metadata, propose retirement of superseded sources, and answer escalated questions. May not publish without the Director's approval.
- **Skills:** document control, version management, regulatory structure.

### 3.3 Legal Reviewer
- **Purpose:** confirm that interpretation notes and escalated answers are legally correct.
- **Works with:** the Regulatory Procedures Officer, the Director.
- **Authority:** may approve or reject an interpretation note and an escalated answer.
- **Skills:** Marsa regulations, legal drafting, risk judgement.

### 3.4 Director of Regulatory Procedures (Approving Officer)
- **Purpose:** decide what is in the Procedures Library.
- **Works with:** all three roles above, heads of Licensing and Inspection.
- **Authority:** the only role that may publish, withdraw or retire a source, and resolve a conflict between sources.
- **Skills:** the regulatory framework, judgement on conflicting texts.

## 4. Procedure

Task ids are used in the audit log and the training material.

### Step 1. Maintain the library (Regulatory Procedures Officer, Legal Reviewer, Director)

| Task | Action | Role |
|---|---|---|
| T01 | Receive a new or changed source from its owner, with a change note. | Regulatory Procedures Officer |
| T02 | Check it is the official signed text; record its metadata (id, title, version, effective date, owner, what it supersedes). | Regulatory Procedures Officer |
| T03 | Review any interpretation note attached to the source. | Legal Reviewer |
| T04 | Approve or refuse publication. | Director |
| T05 | Publish the approved source on its effective date and mark what it supersedes as "Superseded". | Regulatory Procedures Officer |

### Step 2. Answer a question (Procedures Help Desk Officer)

| Task | Action |
|---|---|
| T06 | Receive the question and check it is in scope: what a rule, procedure or fee says, not what to decide on a case. |
| T07 | Search the library for published sources in force on the date the question concerns. |
| T08 | Answer, stating the rule in plain words and citing each source (section 6.2). Quote numbers, dates and fees exactly. |
| T09 | If no source covers the question, or two sources conflict, say so, give no answer on the point, and escalate. |
| T10 | If the officer asks for a decision on a case, explain the rule that applies and who decides; do not decide. |

### Step 3. Gaps and conflicts (Regulatory Procedures Officer, Legal Reviewer, Director)

| Task | Action | Role |
|---|---|---|
| T11 | Log the gap or conflict with the question and the sources involved. | Procedures Help Desk Officer |
| T12 | Answer the escalated question after legal review, and propose a library change if needed. | Regulatory Procedures Officer |
| T13 | Resolve a conflict between sources and record the ruling. | Director |

### Step 4. Assure

| Task | Action | Role |
|---|---|---|
| T14 | Each week, check a 5% sample of answers for accuracy and citation. | Legal Reviewer |
| T15 | Each quarter, confirm every published source is in force and every superseded source is marked. | Regulatory Procedures Officer |

## 5. Timings

| Item | Target |
|---|---|
| Answer from the library | Within 15 minutes in working hours |
| Escalated question answered | Within 3 working days |
| Conflict resolved | Within 5 working days |
| New source published | On its effective date, if received at least 5 working days before |

## 6. Library contents and citation format (fictitious)

### 6.1 Sources in the Procedures Library

| Id | Title | Owner |
|---|---|---|
| REG-LIC-4 | Marsa Licensing Regulation No. 4 | Head of Licensing |
| REG-INS-2 | Marsa Inspection Regulation No. 2 | Head of Inspection |
| SOP-LIC-014 | Trade licence renewal and permit pre-check | Head of Licensing |
| SOP-INS-007 | Inspection findings and violation processing | Head of Inspection |
| SOP-LCC-002 | Licensing and permits contact centre | Head of Licensing Contact Services |
| FEE-2026 | Marsa Fee Schedule 2026 | Director of Finance |
| ACT-CODES | Approved activity code list | Head of Licensing |
| CIRC-xx | Numbered circulars issued by the Director General | Director of Regulatory Procedures |

### 6.2 Citation format
`[id] v[version], section [number], effective [date]`. Example: `SOP-LIC-014 v2.3, section 12 R6, effective 1 Jan 2026`. Every rule stated in an answer carries one citation. A sentence with no citation states no rule.

### 6.3 Source statuses
"Draft": not yet approved, never used in answers. "Published": in force from its effective date. "Superseded": replaced by a named newer source; used only for questions about dates before the replacement. "Withdrawn": removed by the Director; never used.

## 7. Controls

1. Answers come only from Published sources in force on the relevant date.
2. Every rule in an answer is cited (section 6.2).
3. When no source covers a question, or sources conflict, the help desk says so and escalates; it does not fill the gap.
4. The help desk does not decide cases or tell an officer which decision to take.
5. Only the Director publishes, withdraws or retires a source.
6. Officers do not paste personal data into questions; any that arrives is not stored beyond the question log retention.
7. Every question, answer and library change is logged with who, what and when.

## 8. Exceptions and escalation

| Situation | Handled by | Escalate to |
|---|---|---|
| No source covers the question | Help Desk Officer | Regulatory Procedures Officer |
| Two sources conflict | Help Desk Officer | Director (T13) |
| Officer disputes an answer | Help Desk Officer | Legal Reviewer |
| Question about a dispute or litigation | Help Desk Officer | Legal Affairs |
| Source found in force but wrong or outdated | Any role | Director, at once |

## 9. Records

Question and answer log with citations, gap and conflict log, library change log, legal review records, weekly sample and quarterly review. Questions and answers kept for 2 years; library records for 10 years (synthetic retention periods).

## 10. Required source documents and how to submit

### D1. Official source text
- **What it is:** the signed or formally issued text of the regulation, SOP, circular or schedule.
- **What must be true:** it is the final version, with its id, version and effective date on it.
- **Form accepted:** PDF from the issuing office, or the controlled Markdown copy.

### D2. Metadata sheet
- **What it is:** id, title, version, effective date, owner, language, and the ids it supersedes.

### D3. Change note
- **What it is:** a short note from the owner saying what changed and why.
- **When needed:** any new version of an existing source.

### D4. Interpretation note
- **What it is:** a note explaining how a rule is applied in practice.
- **What must be true:** approved by the Legal Reviewer before publication.

### D5. Parallel translation
- **What it is:** the Arabic or English version of a source issued in one language.
- **What must be true:** prepared by a registered translator; the issuing language governs if they differ.

### SUB. How to submit a source
Source owners send D1 to D3 to the Regulatory Procedures Officer through the document control mailbox, at least 5 working days before the effective date.

### VAL. When a source stays valid
A Published source stays in use until the Director marks it Superseded or Withdrawn, or until a review date on its face passes. A passed review date is reported to the owner and the Director at once.

## 11. Detailed description of each task

### T01. Receive a new or changed source
- **Job profile:** Regulatory Procedures Officer.
- **Inputs:** D1 to D3.
- **Steps:** log the submission; check D1 to D3 are present.
- **Output:** a logged submission, or a request to the owner for what is missing.

### T02. Check and record metadata
- **Job profile:** Regulatory Procedures Officer.
- **Steps:** confirm D1 is the official final text; complete D2; identify any source this one supersedes and any it may conflict with.
- **Output:** a Draft entry with complete metadata and a conflict note.

### T03. Legal review of interpretation notes
- **Job profile:** Legal Reviewer.
- **Starts when:** a D4 is attached.
- **Steps:** check the note matches the source text; approve or reject with reasons.
- **Output:** an approved or rejected note.

### T04. Approve publication
- **Job profile:** Director of Regulatory Procedures.
- **Steps:** review the Draft, metadata, conflict note and legal review; approve or refuse.
- **Output:** a recorded decision.

### T05. Publish and retire
- **Job profile:** Regulatory Procedures Officer.
- **Steps:** on the effective date set the source to Published; set every source it replaces to Superseded with a pointer to the replacement; rebuild the search index.
- **Output:** the library updated and the change logged.

### T06. Receive and scope the question
- **Job profile:** Procedures Help Desk Officer.
- **Steps:** read the question; identify the date it concerns (today unless stated); decide whether it asks what a rule says (in scope) or what to decide on a case (T10).
- **Output:** a scoped question.

### T07. Search the library
- **Job profile:** Procedures Help Desk Officer.
- **Steps:** search Published sources in force on that date; for a past date, include sources Superseded after it.
- **Output:** the relevant passages with their citations.

### T08. Answer with citations
- **Job profile:** Procedures Help Desk Officer.
- **Steps:** state the rule in plain words; give each fact its citation; quote numbers and dates exactly as in the source; add nothing the sources do not say.
- **Output:** a cited answer in the officer's language.

### T09. Abstain and escalate
- **Job profile:** Procedures Help Desk Officer.
- **Starts when:** no source covers the point, or sources conflict.
- **Steps:** tell the officer which part cannot be answered and why; cite what the sources do say; escalate (T11).
- **Output:** a partial answer that marks the gap, and an escalation.

### T10. Decline to decide a case
- **Job profile:** Procedures Help Desk Officer.
- **Starts when:** the officer asks what to decide (for example, "should I approve this renewal?").
- **Steps:** explain the rule that applies, with citations, and name the role that decides under the case's SOP.
- **Output:** an answer that states the rule and who decides, with no decision.

### T11. Log the gap or conflict
- **Job profile:** Procedures Help Desk Officer.
- **Output:** an entry in the gap and conflict log, sent to the Regulatory Procedures Officer.

### T12. Answer an escalated question
- **Job profile:** Regulatory Procedures Officer.
- **Steps:** prepare an answer; get the Legal Reviewer's approval; send it to the officer; propose a library change if the gap will recur.
- **Output:** an approved answer and, if needed, a change proposal.

### T13. Resolve a conflict
- **Job profile:** Director of Regulatory Procedures.
- **Steps:** decide which text governs; record the ruling; ask the owners to amend the sources.
- **Output:** a recorded ruling and a circular if needed.

### T14. Weekly answer sample
- **Job profile:** Legal Reviewer.
- **Steps:** check 5% of answers: every rule cited, citation correct, no rule stated without a source, no decision given.
- **Output:** the weekly sample report.

### T15. Quarterly library review
- **Job profile:** Regulatory Procedures Officer.
- **Steps:** check each Published source is in force, each review date is in the future, and each superseded source is marked.
- **Output:** the quarterly review report to the Director.

## 12. Decision rules for an answer

### R1. Who decides
The help desk decides nothing on a case. The officer applies the rule under the case's SOP. Only the Director decides what is in the library.

### R2. What an answer may contain
Only what Published sources in force on the relevant date say, each fact cited.

### R3. Conflicting sources
A newer source governs only where it says it supersedes the older one. Otherwise the conflict is escalated and the point is not answered.

### R4. Abstention
No source, no answer on that point. The help desk says what it cannot answer.

### R5. Interpretation
An interpretation note may be quoted only once approved by the Legal Reviewer.

### R6. Language
Answers are given in the officer's language. If the Arabic and English texts differ, the issuing language governs and the difference is logged.

### R7. Statuses and what they mean
Draft, Published, Superseded and Withdrawn, as in section 6.3.

## 13. Questions officers ask, and the answer under this SOP

### Q1. What is the grace period for a trade licence renewal?
30 days after expiry, with a 10% late fee (SOP-LIC-014 v2.3, section 12 R6).

### Q2. Should I approve this renewal?
The help desk does not decide cases. Under SOP-LIC-014 the Licensing Supervisor decides; the approval conditions are in section 12 R2.

### Q3. What is the fine for a repeat expired insurance certificate?
4,000 (SOP-INS-007 v1.0, section 6, code V04).

### Q4. Is there a rule on mobile food kiosks?
No published source covers mobile kiosks. The question has been sent to the Regulatory Procedures Officer.

### Q5. The answer looks wrong. What do I do?
Reply to dispute it; the Legal Reviewer checks it within 3 working days.

---

## Annex A. Reference breakdown (for testing an SOP analyzer)

This annex is not part of the SOP. It is the answer key a test would compare an analyzer's output against. Flags: **CF** client-facing (the output reaches a citizen), **RA** rights-affecting (a decision about someone's legal standing), **IR** irreversible (cannot be undone through this procedure).

| Task | Job profile | Task type | CF | RA | IR | Suggested for automation |
|---|---|---|:-:|:-:|:-:|---|
| T01 | Regulatory Procedures Officer | Intake of a source | no | no | no | Automate |
| T02 | Regulatory Procedures Officer | Metadata and conflict check | no | no | no | Assist: extract metadata, flag conflicts |
| T03 | Legal Reviewer | Legal review | no | no | no | Human only |
| T04 | Director | Publication approval | no | no | no | Human only |
| T05 | Regulatory Procedures Officer | Publish and re-index | no | no | no | Automate after T04 |
| T06 | Help Desk Officer | Question scoping | no | no | no | Automate |
| T07 | Help Desk Officer | Retrieval | no | no | no | Automate |
| T08 | Help Desk Officer | Cited answer | no | no | no | Automate, cite every rule |
| T09 | Help Desk Officer | Abstain and escalate | no | no | no | Automate |
| T10 | Help Desk Officer | Decline to decide | no | no | no | Automate, fixed rule |
| T11 | Help Desk Officer | Gap logging | no | no | no | Automate |
| T12 | Regulatory Procedures Officer | Escalated answer | no | no | no | Assist: draft answer |
| T13 | Director | Conflict ruling | no | no | no | Human only |
| T14 | Legal Reviewer | Answer sampling | no | no | no | Assist: select sample, check citations |
| T15 | Regulatory Procedures Officer | Library review | no | no | no | Assist: list expired review dates |

**Expected shape of the result.** Four job profiles, fifteen tasks. No task is client-facing, rights-affecting or irreversible; the risks are a wrong or uncited answer and a stale library. The Help Desk Officer's tasks are fully automatable within R2 to R4. Publication and conflict rulings stay human.
