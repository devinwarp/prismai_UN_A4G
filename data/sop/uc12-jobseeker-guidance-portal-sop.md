# SOP-EMP-003: Jobseeker and applicant guidance portal

> **Fictitious document.** Sahel Federal Workforce Agency, its programmes, criteria, dates, systems and staff titles are invented for demonstration. Nothing here describes a real authority or real law.

| Field | Value |
|---|---|
| Document id | SOP-EMP-003 |
| Version | 1.0 (synthetic) |
| Owner | Head of Employment Services, Sahel Federal Workforce Agency |
| Related use case | UC12: Jobseeker and applicant guidance portal |
| Applies to | Answering jobseekers' and applicants' questions on the Sahel Careers Portal from published guidance pages, and publishing, updating and retiring those pages |
| Review cycle | Every 12 months |

## 1. Purpose

Help every jobseeker understand how federal recruitment and Sahel employment programmes work, accurately and in the same way for everyone, with the source page cited. Users always know when an answer comes from an AI assistant. The portal informs; it takes no action (no applications, no status changes, no referrals) and never tells a person whether they will be shortlisted or selected. Those decisions belong to the people named in SOP-REC-011.

## 2. Scope

**In scope:** questions from the public about how to apply for federal vacancies, minimum requirements by grade, documents, the selection process and timings, Sahel employment programmes, career events, and recruitment fraud warnings; the guidance pages (drafting, review, publication, retirement).

**Out of scope:** the status of a person's own application (the portal's "My applications" page); any decision on an application (SOP-REC-011); complaints and appeals (SOP-REC-020); employer services; immigration and work-permit questions (other authorities).

## 3. Roles

Four job profiles carry out this procedure. Each has a distinct purpose, a fixed set of tasks and its own limits.

### 3.1 Employment Guidance Officer
- **Purpose:** answer jobseekers' questions from Published guidance pages, citing each page.
- **Works with:** jobseekers (portal chat), the Employment Services Supervisor.
- **Authority:** may answer from Published pages, explain published criteria and point to the right portal page. May not say whether a person meets requirements or will be shortlisted, view or change an application, or take any action.
- **Skills:** plain writing in Arabic and English, the recruitment process, neutral and inclusive language.

### 3.2 Employment Services Content Officer
- **Purpose:** write and maintain the guidance pages.
- **Works with:** the Talent Acquisition team, programme managers, the Supervisor.
- **Authority:** may draft and update pages and propose retirement. May not publish.
- **Skills:** content design, readability, translation management.

### 3.3 Employment Services Supervisor
- **Purpose:** own the quality of answers, handle escalations, and review pages for accuracy.
- **Works with:** the Guidance Officer, the Content Officer, Talent Acquisition.
- **Authority:** may answer escalations, approve a page as accurate, and refer fraud reports.
- **Skills:** recruitment rules (SOP-REC-011), employment programmes, fair treatment.

### 3.4 Head of Employment Services (Approving Officer)
- **Purpose:** decide what is published.
- **Authority:** the only role that may publish, withdraw or retire a page and approve an urgent notice.
- **Skills:** public communication, employment policy.

## 4. Procedure

Task ids are used in the audit log and the training material.

### Step 1. Answer a question (Employment Guidance Officer)

| Task | Action |
|---|---|
| T01 | Start with the AI disclosure and language choice; say that the portal explains the process but does not decide applications. |
| T02 | If the user reports a suspected recruitment scam, give the fraud warning page and the reporting route at once. |
| T03 | Search Published pages; answer in plain words; cite the page for every fact; quote requirements, dates and salaries exactly. |
| T04 | If the user asks about their own application status, or asks the portal to apply, change or withdraw anything, point to the "My applications" page or the vacancy page; take no action. |
| T05 | If the user asks whether they personally qualify or will be selected, explain the published criteria with citations and say the Screening Analyst and panel decide. |
| T06 | If no page covers the question, say so and log it for the Supervisor. |

### Step 2. Escalations and monitoring

| Task | Action | Role |
|---|---|---|
| T07 | Answer logged questions that need a person within 2 working days, by the user's portal inbox. | Employment Services Supervisor |
| T08 | Each week, review unanswered questions and propose new or changed pages. | Content Officer |

### Step 3. Publish and maintain pages

| Task | Action | Role |
|---|---|---|
| T09 | Draft a new page or update, with sources and a review date. | Content Officer |
| T10 | Check the draft against SOP-REC-011 and programme rules. | Employment Services Supervisor |
| T11 | Approve or refuse publication. | Head of Employment Services |
| T12 | Publish and mark the replaced version "Superseded". | Content Officer |

### Step 4. Assure

| Task | Action | Role |
|---|---|---|
| T13 | Each week, check a 5% sample of answers for accuracy, citation, neutrality and no-decision. | Employment Services Supervisor |
| T14 | Each quarter, check that answers to the same question are the same for all users, and that no page is past its review date. | Head of Employment Services |

## 5. Timings

| Item | Target |
|---|---|
| Answer | Within 10 seconds |
| Fraud warning | Immediate |
| Escalated question | Within 2 working days |
| Page update after a rule change | Before the rule takes effect |
| Event or deadline change | Same working day |

## 6. Guidance pages and programmes (fictitious)

### 6.1 Published guidance pages

| Page | Topic |
|---|---|
| EG-APPLY | How to apply for a federal vacancy |
| EG-GRADES | Grades, minimum requirements and salary bands (from SOP-REC-011, section 6) |
| EG-DOCS | Documents you need |
| EG-PROCESS | What happens after you apply, and timings |
| EG-PROG | Sahel employment programmes |
| EG-EVENTS | Career events |
| EG-FRAUD | Recruitment fraud warning |
| EG-ADJUST | Adjustments for assessments and interviews |

### 6.2 Employment programmes (EG-PROG, synthetic)

| Programme | Who it is for | Length | Applications |
|---|---|---|---|
| Graduate Pathway | Nationals who graduated within the last 2 years | 12 months, paid | February and September intakes |
| Career Return | People returning after 2 or more years out of work | 6 months, paid | Open all year |
| Federal Internship | Current university students in their final 2 years | 8 to 12 weeks | Summer intake, apply by 31 March |

### 6.3 Fraud warning (EG-FRAUD)
Sahel never charges a fee to apply, never asks for payment for an interview, medical or visa, and only contacts applicants from @sahel.example addresses and through the Careers Portal inbox. Suspected fraud is reported to fraud@sahel.example.

### 6.4 Citation format
Page id, title and last updated date, with a link.

## 7. Controls

1. Every conversation starts with the AI disclosure.
2. Every fact in an answer is cited to a Published page.
3. The portal never says whether a person qualifies, will be shortlisted or selected.
4. The portal takes no action on any application and cannot see applications.
5. Answers are the same for every user; no answer depends on nationality, gender, age, disability or any other personal characteristic except where a published programme rule states an eligibility condition, which is quoted exactly.
6. Users are not asked for personal details; any given are removed from the log.
7. Only the Head of Employment Services publishes, withdraws or retires a page.
8. Every page change and answer is logged with who, what and when.

## 8. Exceptions and escalation

| Situation | Handled by | Escalate to |
|---|---|---|
| Suspected recruitment scam | Guidance Officer | EG-FRAUD; Supervisor refers to Internal Audit and police |
| Question not covered | Guidance Officer | Supervisor (T07) |
| User complains about a recruitment decision | Guidance Officer | SOP-REC-020 route |
| Page found wrong or outdated | Any role | Head of Employment Services, at once |
| User asks for an adjustment for an assessment | Guidance Officer | EG-ADJUST; Recruitment Coordinator under SOP-REC-011 |

## 9. Records

Page versions and approvals, answer logs with citations, unanswered-question log, fraud reports, weekly and quarterly reviews. Answer logs kept for 1 year; page records for 7 years (synthetic retention periods).

## 10. Required documents for a page and how to submit

### D1. Page draft
- **What must be true:** plain language, one topic, last updated date and review date.

### D2. Source reference
- **What must be true:** every rule on the page traces to SOP-REC-011, a programme rule, or an approved notice.

### D3. Accuracy check
- **What must be true:** signed by the Employment Services Supervisor.

### D4. Translation
- **What must be true:** Arabic and English say the same; the Arabic text governs if they differ.

### SUB. How to submit
The Content Officer submits D1 to D4 in the content system. The public cannot submit content.

### VAL. When a page stays valid
A Published page stays in use until its review date or until the rule it reflects changes, whichever is first.

## 11. Detailed description of each task

### T01. Disclose and set the language
- **Job profile:** Employment Guidance Officer.
- **Output:** a conversation with the disclosure and language recorded.

### T02. Fraud warning
- **Job profile:** Employment Guidance Officer.
- **Starts when:** the user mentions being asked to pay, a message from a non-Sahel address, or an offer they did not apply for.
- **Steps:** give the EG-FRAUD content and reporting address; advise not to pay.
- **Output:** a warning given and logged.

### T03. Answer with citations
- **Job profile:** Employment Guidance Officer.
- **Steps:** search Published pages; answer; cite each fact. Example: "What do I need for a G6 job?" is answered with a Bachelor's degree and 2 years' relevant experience (EG-GRADES).
- **Output:** a cited answer.

### T04. Redirect status and action requests
- **Job profile:** Employment Guidance Officer.
- **Output:** a reply naming the "My applications" page or the vacancy page; no action taken.

### T05. Explain criteria without deciding
- **Job profile:** Employment Guidance Officer.
- **Starts when:** the user asks "Do I qualify?" or "Will I be shortlisted?"
- **Steps:** quote the published criteria for the grade or programme; say that the Screening Analyst checks applications and the panel decides (SOP-REC-011).
- **Output:** an answer with the criteria and no verdict.

### T06. Abstain and log
- **Job profile:** Employment Guidance Officer.
- **Output:** a reply that the portal cannot answer that, and a logged question.

### T07. Answer an escalated question
- **Job profile:** Employment Services Supervisor.
- **Output:** an answer sent to the user's portal inbox.

### T08. Weekly question review
- **Job profile:** Employment Services Content Officer.
- **Output:** a list of proposed page changes.

### T09. Draft a page
- **Job profile:** Employment Services Content Officer.
- **Output:** D1, D2 and D4.

### T10. Accuracy check
- **Job profile:** Employment Services Supervisor.
- **Output:** D3.

### T11. Approve publication
- **Job profile:** Head of Employment Services.
- **Output:** a recorded decision.

### T12. Publish
- **Job profile:** Employment Services Content Officer.
- **Output:** the page live, the previous version Superseded, the index rebuilt.

### T13. Weekly answer sample
- **Job profile:** Employment Services Supervisor.
- **Steps:** check 5% of answers for disclosure, citation, neutral language, and that no answer gave a verdict on a person.
- **Output:** the weekly sample report.

### T14. Quarterly consistency review
- **Job profile:** Head of Employment Services.
- **Steps:** compare answers to the 20 most frequent questions across users; check no page is past review.
- **Output:** the quarterly review.

## 12. Decision rules for an answer

### R1. Who decides
The portal decides nothing. Applications are decided under SOP-REC-011. Only the Head of Employment Services decides what is published.

### R2. Source
Every fact comes from a Published page and is cited.

### R3. No verdict on a person
The portal explains criteria; it never says whether a person meets them or will be selected.

### R4. No action
The portal takes no action on any application.

### R5. Same answer for everyone
Answers do not vary by personal characteristic, except where a published eligibility rule is quoted.

### R6. Gaps
No page, no answer on that point; the question is logged.

### R7. Statuses
Pages are Draft, Published, Superseded or Retired.

## 13. Questions jobseekers ask, and the answer under this SOP

### Q1. How do I apply for a federal job?
Through the vacancy page on the Sahel Careers Portal only; applications by email are not accepted (EG-APPLY).

### Q2. Do I qualify for this G7 job?
G7 needs a Bachelor's degree and 5 years' relevant experience (EG-GRADES). The Screening Analyst checks each application against these.

### Q3. What happened to my application?
Check "My applications" on the Careers Portal.

### Q4. Someone asked me to pay for my visa to start a Sahel job.
Sahel never asks for payment. Do not pay; report it to fraud@sahel.example (EG-FRAUD).

### Q5. I have been out of work for three years. Is there a programme for me?
Career Return is for people returning after 2 or more years out of work; it runs 6 months and is open all year (EG-PROG).

---

## Annex A. Reference breakdown (for testing an SOP analyzer)

This annex is not part of the SOP. It is the answer key a test would compare an analyzer's output against. Flags: **CF** client-facing (the output reaches the public), **RA** rights-affecting (a decision about someone's legal standing), **IR** irreversible (cannot be undone through this procedure).

| Task | Job profile | Task type | CF | RA | IR | Suggested for automation |
|---|---|---|:-:|:-:|:-:|---|
| T01 | Guidance Officer | Disclosure | yes | no | no | Automate, fixed script |
| T02 | Guidance Officer | Fraud warning | yes | no | no | Automate, fixed rule |
| T03 | Guidance Officer | Cited answer | yes | no | no | Automate, cite every fact |
| T04 | Guidance Officer | Redirect | yes | no | no | Automate |
| T05 | Guidance Officer | Criteria without verdict | yes | no | no | Automate, fixed rule |
| T06 | Guidance Officer | Abstain and log | yes | no | no | Automate |
| T07 | Employment Services Supervisor | Escalated answer | yes | no | no | Assist: draft answer |
| T08 | Content Officer | Question review | no | no | no | Assist: cluster questions |
| T09 | Content Officer | Page drafting | no | no | no | Assist: draft |
| T10 | Employment Services Supervisor | Accuracy check | no | no | no | Human only |
| T11 | Head of Employment Services | Publication approval | no | no | no | Human only |
| T12 | Content Officer | Publish and re-index | yes | no | no | Automate after T11 |
| T13 | Employment Services Supervisor | Answer sampling | no | no | no | Assist: select sample |
| T14 | Head of Employment Services | Consistency review | no | no | no | Assist: compare answers |

**Expected shape of the result.** Four job profiles, fourteen tasks. Answers are client-facing but none is rights-affecting or irreversible, because the portal decides and does nothing. The main risks are a verdict on a person (R3) and unequal answers (R5). The Guidance Officer's tasks are automatable; accuracy checks and publication stay human.
