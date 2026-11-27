# SOP-PHC-006: Public health information portal

> **Fictitious document.** Wahat Health Services Authority, its health advice pages, schedules, phone numbers and staff titles are invented for demonstration. Nothing here is medical advice or describes a real authority or real law.

| Field | Value |
|---|---|
| Document id | SOP-PHC-006 |
| Version | 1.0 (synthetic) |
| Owner | Head of Public Health Communications, Wahat Health Services Authority |
| Related use case | UC08: Public health information portal |
| Applies to | Answering the public's questions on the Wahat public health portal from approved health advice pages, and publishing, updating and retiring those pages, including urgent outbreak alerts |
| Review cycle | Every 12 months |

## 1. Purpose

Give the public accurate, current and understandable public health information, always with the source page so they can read it themselves. Users always know when an answer comes from an AI assistant. The portal informs; it takes no action for anyone (no bookings, no records, no referrals) and never gives personal medical advice. Anyone describing an emergency is sent to emergency care at once.

## 2. Scope

**In scope:** questions from the public on the portal and its chat about the topics on Published advice pages; publishing and updating those pages; urgent outbreak and health alerts; monitoring unanswered questions and common misinformation.

**Out of scope:** personal medical advice or diagnosis; booking or changing appointments (SOP-APT-003); access to personal health records; complaints (SOP-CMP-007); media enquiries.

## 3. Roles

Four job profiles carry out this procedure. Each has a distinct purpose, a fixed set of tasks and its own limits.

### 3.1 Public Health Information Officer
- **Purpose:** answer public questions from Published advice pages, citing the page.
- **Works with:** members of the public (portal chat), the Public Health Communications Officer.
- **Authority:** may answer from Published pages and give the published phone numbers and links. May not give personal medical advice, take any action for the user, or answer from anything other than Published pages.
- **Skills:** plain-language health writing in Arabic and English, the emergency screen (section 6.2).

### 3.2 Public Health Communications Officer
- **Purpose:** write and maintain the advice pages and watch what the public asks.
- **Works with:** subject experts, the Content Reviewer, the Head of Public Health Communications.
- **Authority:** may draft and update pages, set review dates and propose retirement. May not publish.
- **Skills:** health communication, readability, translation management.

### 3.3 Public Health Content Reviewer
- **Purpose:** confirm that a page is medically and epidemiologically correct.
- **Works with:** the Communications Officer.
- **Authority:** may approve or reject a page for accuracy.
- **Skills:** public health medicine or epidemiology.

### 3.4 Head of Public Health Communications (Approving Officer)
- **Purpose:** decide what is published.
- **Works with:** all three roles above, the Director of Public Health for alerts.
- **Authority:** the only role that may publish, withdraw or retire a page, and approve an urgent alert.
- **Skills:** risk communication, judgement on sensitive content.

## 4. Procedure

Task ids are used in the audit log and the training material.

### Step 1. Answer a question (Public Health Information Officer)

| Task | Action |
|---|---|
| T01 | Start each conversation with the AI disclosure and the language choice; state that the portal gives general information, not personal medical advice. |
| T02 | Run the emergency screen. If the user describes an emergency, give the emergency number and the nearest emergency department advice at once, and nothing else. |
| T03 | If the user asks for an action (book, change a record, send a referral), say the portal cannot do it and give the published channel. |
| T04 | Search Published pages; answer in plain words and cite the page for every fact. |
| T05 | If no Published page covers the question, or the user asks for personal advice, say so, give the general information that exists with its page, and suggest the published advice line or their doctor. |

### Step 2. Publish and maintain pages

| Task | Action | Role |
|---|---|---|
| T06 | Draft a new page or update, with sources and a review date. | Communications Officer |
| T07 | Review the draft for accuracy. | Content Reviewer |
| T08 | Approve or refuse publication. | Head of Public Health Communications |
| T09 | Publish, and mark the replaced version "Superseded". | Communications Officer |

### Step 3. Urgent alerts

| Task | Action | Role |
|---|---|---|
| T10 | Draft an alert from the Director of Public Health's notification. | Communications Officer |
| T11 | Approve the alert after an accuracy check by the Content Reviewer, and publish it at the top of the portal. | Head of Public Health Communications |

### Step 4. Monitor and assure

| Task | Action | Role |
|---|---|---|
| T12 | Each week, review unanswered questions and recurring misinformation, and propose new or changed pages. | Communications Officer |
| T13 | Each week, check a 5% sample of answers for accuracy, citation and tone. | Content Reviewer |
| T14 | Each month, list pages past their review date and decide to update or retire them. | Head of Public Health Communications |

## 5. Timings

| Item | Target |
|---|---|
| Emergency screen | Immediate, before any search |
| Answer | Within 10 seconds |
| New or updated page | 10 working days from draft |
| Urgent alert | Published within 4 hours of notification |
| Unanswered-question review | Weekly |

## 6. Advice pages and emergency screen (fictitious)

### 6.1 Published advice pages

| Page | Topic |
|---|---|
| PH-VAC-01 | Childhood vaccination schedule |
| PH-VAC-02 | Seasonal influenza vaccine: who should have it and where |
| PH-HEAT-01 | Staying safe in extreme heat |
| PH-VEC-01 | Preventing mosquito-borne illness |
| PH-FOOD-01 | Food safety at home |
| PH-ALERT-xx | Current outbreak and health alerts |
| PH-CONTACT | Advice line (800 9247, 8:00 to 20:00) and service locator |

### 6.2 Emergency screen
Any of: chest pain; severe difficulty breathing; sudden weakness of the face or limbs; heavy bleeding; collapse or unconsciousness; thoughts of self-harm; a baby under 3 months with a fever. Reply: call the emergency number now or go to the nearest emergency department. For self-harm, also give the published support line.

### 6.3 Citation format
Page id, title and last updated date, with a link. Example: `PH-VAC-02 Seasonal influenza vaccine, updated 1 Sep 2026`.

### 6.4 Page statuses
"Draft", "Published", "Superseded", "Retired", and "Alert" (an urgent Published page shown at the top of the portal until its end date).

## 7. Controls

1. Every conversation starts with the AI disclosure.
2. The emergency screen runs before every answer.
3. Every fact in an answer is cited to a Published page; nothing else is used.
4. The portal takes no action for a user and gives no personal medical advice.
5. A question no page covers is not answered from general knowledge; it is logged.
6. Only the Head of Public Health Communications publishes, withdraws, retires or approves an alert.
7. Users are not asked for personal details; any given are removed from the log.
8. Every page change and answer is logged with who, what and when.

## 8. Exceptions and escalation

| Situation | Handled by | Escalate to |
|---|---|---|
| User describes an emergency | Information Officer | Emergency number, at once (6.2) |
| User at risk of self-harm | Information Officer | Emergency number and support line |
| Question not covered by any page | Information Officer | Communications Officer (T12) |
| Page found wrong or outdated | Any role | Head of Public Health Communications, at once |
| Notification of an outbreak | Communications Officer | Urgent alert route (T10, T11) |
| Media or political question | Information Officer | Communications Office |

## 9. Records

Page versions with approvals, alert approvals, answer logs with citations, unanswered-question log, weekly samples, monthly review list. Answer logs kept for 1 year; page records for 10 years (synthetic retention periods).

## 10. Required documents for a page and how to submit

### D1. Page draft
- **What must be true:** plain language (reading age 12 or below), one topic, a "last updated" date and a review date.

### D2. Source list
- **What must be true:** each statement on the page traces to an approved clinical policy, a national guideline, or a named expert source.

### D3. Accuracy review record
- **What must be true:** signed by the Content Reviewer.

### D4. Translation
- **What must be true:** Arabic and English versions say the same thing; checked by a second translator.

### SUB. How to submit
The Communications Officer submits D1 to D4 in the content system for approval. Users cannot submit content.

### VAL. When a page stays valid
A Published page stays in use until its review date. After that it is flagged in the monthly list (T14) and must be updated or retired within 30 days. An alert ends on its end date.

## 11. Detailed description of each task

### T01. Disclose and set the language
- **Job profile:** Public Health Information Officer.
- **Steps:** state that this is Wahat's AI assistant, that answers come from Wahat's published advice pages, and that it does not give personal medical advice; offer Arabic or English.
- **Output:** a conversation with the disclosure recorded.

### T02. Emergency screen
- **Job profile:** Public Health Information Officer.
- **Steps:** check the message against section 6.2 before any search. If it matches, reply only with the emergency advice.
- **Output:** an emergency reply, or the question passed on.

### T03. Decline an action
- **Job profile:** Public Health Information Officer.
- **Starts when:** the user asks the portal to book, change, send or record something.
- **Steps:** say the portal cannot do it; give the published channel (for appointments, the Wahat booking line and app under SOP-APT-003).
- **Output:** a reply with the right channel, and no action taken.

### T04. Answer with citations
- **Job profile:** Public Health Information Officer.
- **Steps:** search Published pages and current Alerts; answer in plain words; cite the page for every fact; link to it.
- **Output:** a cited answer.

### T05. Abstain or redirect
- **Job profile:** Public Health Information Officer.
- **Starts when:** no page covers the question, or the user asks about their own symptoms, results or treatment.
- **Steps:** say the portal cannot answer that; give any general information that exists, cited; suggest the advice line (PH-CONTACT) or their doctor; log the question.
- **Output:** a safe reply and a logged question.

### T06. Draft or update a page
- **Job profile:** Public Health Communications Officer.
- **Output:** D1, D2 and D4 ready for review.

### T07. Accuracy review
- **Job profile:** Public Health Content Reviewer.
- **Output:** D3, approved or rejected with reasons.

### T08. Approve publication
- **Job profile:** Head of Public Health Communications.
- **Output:** a recorded decision.

### T09. Publish
- **Job profile:** Public Health Communications Officer.
- **Steps:** publish; mark the previous version Superseded; rebuild the search index.
- **Output:** the page live and logged.

### T10. Draft an urgent alert
- **Job profile:** Public Health Communications Officer.
- **Starts when:** the Director of Public Health notifies an outbreak or hazard.
- **Steps:** draft what is happening, who is affected, what to do and where to get help; set an end date.
- **Output:** an alert draft within 2 hours.

### T11. Approve and publish the alert
- **Job profile:** Head of Public Health Communications.
- **Steps:** obtain the Content Reviewer's accuracy check; approve; publish at the top of the portal.
- **Output:** the alert live within 4 hours.

### T12. Review unanswered questions and misinformation
- **Job profile:** Public Health Communications Officer.
- **Output:** a list of proposed new or changed pages.

### T13. Weekly answer sample
- **Job profile:** Public Health Content Reviewer.
- **Steps:** check 5% of answers: disclosure, emergency screen, citation, no personal advice, no action taken.
- **Output:** the weekly sample report.

### T14. Monthly review-date list
- **Job profile:** Head of Public Health Communications.
- **Output:** each past-review page assigned for update or retirement.

## 12. Decision rules for an answer

### R1. Who decides
The portal decides nothing for a user. Only the Head of Public Health Communications decides what is published.

### R2. Emergency first
A message that matches the emergency screen gets the emergency advice and nothing else.

### R3. Source
Every fact comes from a Published page or a current Alert and is cited.

### R4. No action, no personal advice
The portal takes no action and does not advise on a person's own health.

### R5. Gaps
No page, no answer on that point. The question is logged.

### R6. Alerts
A current Alert takes precedence over an ordinary page on the same topic.

### R7. Statuses and what they mean
As in section 6.4.

## 13. Questions the public asks, and the answer under this SOP

### Q1. Who should get the flu vaccine?
The answer quotes PH-VAC-02 with its citation and link.

### Q2. I have chest pain. What should I do?
Call the emergency number now or go to the nearest emergency department.

### Q3. Can you book my child's vaccination?
The portal cannot book. Use the Wahat booking line or app.

### Q4. My blood test shows high sugar. Is that diabetes?
The portal cannot advise on your own results. Please speak to your doctor, or call the advice line on 800 9247.

### Q5. Is it true that the vaccine causes illness?
The answer gives what the Published page says about vaccine safety, cited; it does not repeat the claim as fact.

---

## Annex A. Reference breakdown (for testing an SOP analyzer)

This annex is not part of the SOP. It is the answer key a test would compare an analyzer's output against. Flags: **CF** client-facing (the output reaches the public), **RA** rights-affecting (a decision about someone's legal standing), **IR** irreversible (cannot be undone through this procedure).

| Task | Job profile | Task type | CF | RA | IR | Suggested for automation |
|---|---|---|:-:|:-:|:-:|---|
| T01 | Information Officer | Disclosure | yes | no | no | Automate, fixed script |
| T02 | Information Officer | Emergency screen | yes | no | no | Automate, fixed rule, fail safe |
| T03 | Information Officer | Decline an action | yes | no | no | Automate, fixed rule |
| T04 | Information Officer | Cited answer | yes | no | no | Automate, cite every fact |
| T05 | Information Officer | Abstain or redirect | yes | no | no | Automate |
| T06 | Communications Officer | Page drafting | no | no | no | Assist: draft and readability check |
| T07 | Content Reviewer | Accuracy review | no | no | no | Human only |
| T08 | Head of Public Health Communications | Publication approval | no | no | no | Human only |
| T09 | Communications Officer | Publish and re-index | yes | no | no | Automate after T08 |
| T10 | Communications Officer | Alert drafting | no | no | no | Assist: draft |
| T11 | Head of Public Health Communications | Alert approval | yes | no | no | Human only |
| T12 | Communications Officer | Gap and misinformation review | no | no | no | Assist: cluster questions |
| T13 | Content Reviewer | Answer sampling | no | no | no | Assist: select sample |
| T14 | Head of Public Health Communications | Review-date decisions | no | no | no | Assist: list pages |

**Expected shape of the result.** Four job profiles, fourteen tasks. Answers are client-facing but none is rights-affecting or irreversible, because the portal takes no action. The Information Officer's tasks are automatable within R2 to R5, with the emergency screen first. Publication and alerts stay human.
