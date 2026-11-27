# SOP-FIN-009: Traffic fine enquiries, payment and objections

> **Fictitious document.** Qanat Transport and Mobility Agency, its fines, discounts, deadlines, systems and staff titles are invented for demonstration. Nothing here describes a real authority or real law.

| Field | Value |
|---|---|
| Document id | SOP-FIN-009 |
| Version | 1.0 (synthetic) |
| Owner | Head of Enforcement Services, Qanat Transport and Mobility Agency |
| Related use case | UC13: Citizen mobility and fines assistant |
| Applies to | Enquiries about traffic fines, payment of fines, instalment plans and objections, and general mobility questions on the same channels |
| Review cycle | Every 12 months |

## 1. Purpose

Tell every citizen exactly which fines they have and why, take payment correctly, and decide objections fairly with reasons. Answers about routes, permits and fares come only from the current published timetable and rules. A person approves every enforcement or fine notice and every objection decision.

## 2. Scope

**In scope:** enquiries about fines on a person's or company's vehicles; explanation of a fine; payment and early-payment discount; instalment plans; objections to a fine; notices about fines; general questions about routes, fares and permits asked on the same channels.

**Out of scope:** issuing fines at the roadside or by camera (SOP-ENF-002); vehicle impounding and release (SOP-ENF-006); court cases; applications for permits (SOP-PRM-004); complaints about staff (SOP-CX-001).

## 3. Roles

Four job profiles carry out this procedure. Each has a distinct purpose, a fixed set of tasks and its own limits.

### 3.1 Mobility Service Agent
- **Purpose:** answer the citizen, explain their fines and take payment or an objection.
- **Works with:** citizens (app, portal, phone, counter), the Payments Officer, the Fines Review Officer.
- **Authority:** may read and explain fines from the fines register, quote the amount due, take payment, register an objection, and answer mobility questions from the published timetable and rules. May not cancel, reduce or change a fine, decide an objection, or state a service, fare or closure not in the published sources.
- **Skills:** Arabic and English, the fines register, the fine table (section 6), the published timetable and permit rules.

### 3.2 Payments Officer
- **Purpose:** reconcile payments and set up instalment plans.
- **Works with:** the Agent, the finance system, the Enforcement Supervisor.
- **Authority:** may confirm and match payments and set up an instalment plan that meets rule R5. May not waive or reduce a fine.
- **Skills:** payment reconciliation, instalment rules.

### 3.3 Fines Review Officer
- **Purpose:** examine an objection and recommend a decision.
- **Works with:** the Agent, camera and patrol records, the Enforcement Supervisor.
- **Authority:** may gather evidence and recommend "uphold", "cancel" or "amend". May not decide.
- **Skills:** reading camera evidence and calibration records, the offence codes, clear written reasoning.

### 3.4 Enforcement Supervisor (Approving Officer)
- **Purpose:** decide objections and approve every notice about a fine.
- **Works with:** the Review Officer, the Payments Officer, the Head of Enforcement Services.
- **Authority:** the only role that may cancel, amend or uphold a fine on objection, approve an instalment plan outside rule R5, and approve any enforcement or fine notice before it is sent.
- **Skills:** traffic rules, evidence standards, judgement on exceptions, writing decision notices that give reasons.

## 4. Procedure

Task ids are used in the audit log and the training material.

### Step 1. Enquiry (Mobility Service Agent)

| Task | Action |
|---|---|
| T01 | Receive the enquiry from the app, portal, phone or counter. Tell the citizen whether they are talking to an AI assistant or a person. |
| T02 | Verify the citizen's identity and their link to the vehicle (D1, D2, and D4 for a company vehicle). |
| T03 | Read the fines from the fines register and explain each one: offence code and name, date, time, place, amount, black points, and whether evidence is available to view. |
| T04 | Answer a general mobility question (route, fare, permit rule, closure) from the current published timetable and rules only, and name the source and its date. |

### Step 2. Payment (Agent and Payments Officer)

| Task | Action |
|---|---|
| T05 | Calculate the amount due for each fine from section 6, including the early-payment discount if it still applies. |
| T06 | Take payment for the fines the citizen chooses and give a receipt. |
| T07 | Confirm the payment in the finance system and mark the fines paid. |
| T08 | Set up an instalment plan when the citizen asks and rule R5 is met. Anything outside R5 goes to the Enforcement Supervisor. |

### Step 3. Objection (Agent, Review Officer, Supervisor)

| Task | Action |
|---|---|
| T09 | Register an objection made within 30 days of the fine date, with the citizen's reasons and evidence (D5). Pause the late surcharge on that fine. |
| T10 | Gather the record: camera image or patrol report, device calibration record, and the vehicle and ownership record on the date. |
| T11 | Recommend "uphold", "cancel" or "amend", with reasons tied to the evidence. |
| T12 | Enforcement Supervisor: decide the objection and record the reasons. |
| T13 | Send the decision notice, approved by the Supervisor, with the reasons and the route to court. |

### Step 4. Notices (Supervisor)

| Task | Action |
|---|---|
| T14 | Approve every notice about a fine before it is sent: new fine notices, reminders with a surcharge, and amendments. |

### Step 5. Close and assure

| Task | Action | Role |
|---|---|---|
| T15 | Write every action to the audit log and close the enquiry or objection. | Mobility Service Agent |
| T16 | Each month, sample 5% of enquiries and 10% of objection decisions and check them against this SOP. Report any deviation. | Enforcement Supervisor |

## 5. Timings

| Item | Target |
|---|---|
| First reply | Phone within 60 seconds; app and portal within 1 working day |
| Payment confirmed | Same day |
| Instalment plan set up | 2 working days |
| Objection acknowledged | At once, with a reference number |
| Objection decided | 15 working days |
| Decision notice sent | 1 working day after the decision |

## 6. Fine table (fictitious)

| Code | Offence | Fine | Black points |
|---|---|---|---|
| SP1 | Speeding up to 20 km/h over the limit | 300 | 0 |
| SP2 | Speeding 21 to 40 km/h over the limit | 700 | 4 |
| SP3 | Speeding more than 40 km/h over the limit | 1,500 | 8 |
| RL1 | Crossing a red light | 1,000 | 12 |
| MP1 | Using a handheld phone while driving | 800 | 4 |
| PK1 | Parking in a no-parking zone | 200 | 0 |
| PK2 | Parking in a disabled bay without a permit | 1,000 | 4 |
| BL1 | Driving in a bus lane | 500 | 0 |

**Early-payment discount:** 25% off a fine paid in full within 30 days of the fine date. The discount does not apply to RL1. Black points are not reduced.
**Late surcharge:** 10% of the fine, added once, to a fine unpaid 90 days after the fine date. It is paused while an objection is open.

Amounts are in a synthetic currency unit. Fines are quoted to citizens exactly as in this table and the fines register.

## 7. Controls

1. Only the Enforcement Supervisor may cancel, amend or uphold a fine on objection; no one may waive or reduce a fine outside this procedure.
2. Every enforcement or fine notice is approved by the Enforcement Supervisor before it is sent.
3. Fines are read only from the fines register; amounts only from section 6.
4. Mobility answers come only from the current published timetable and rules. No service, fare, route or closure is stated unless it is there.
5. Fine details are given only to a verified owner, driver or authorised company contact.
6. Every citizen is told whether they are talking to an AI assistant or a person.
7. Notices go only to the contact details on the vehicle or licence record.
8. Every action is written to the audit log with who, what and when.
9. Camera images are shown only to the verified owner or driver and used only for this fine.

## 8. Exceptions and escalation

| Situation | Handled by | Escalate to |
|---|---|---|
| Objection made after 30 days | Agent | Enforcement Supervisor decides whether to accept it |
| Vehicle sold or stolen before the fine date | Review Officer | Enforcement Supervisor |
| Calibration record missing or expired | Review Officer | Enforcement Supervisor; Head of Enforcement Services if repeated |
| Instalment plan outside R5 | Payments Officer | Enforcement Supervisor |
| Payment mismatch | Payments Officer | Finance |
| Question not covered by the published timetable or rules | Agent | The responsible Qanat department; the citizen is told it will be answered |
| Citizen disputes an objection decision | Enforcement Supervisor | Court route named in the notice |
| Suspected fraud | Agent | Compliance, immediately |

## 9. Records

Enquiry log, fines register entries, payments and receipts, instalment plans, objections with evidence, recommendations, decisions, notices and their approvals, monthly sample report. Kept for 7 years (synthetic retention period).

## 10. Required documents and how to submit

An enquiry about fines needs D1 and D2. D3 to D6 are needed only in the situations described. Citizens may send documents in Arabic or English.

### D1. Identity document
- **What it is:** the national ID card, or for a non-national the passport with the residence permit.
- **What must be true:** valid, and the name matches the vehicle or licence record.

### D2. Vehicle registration or plate number
- **What must be true:** the vehicle is registered to the citizen, or the citizen is the driver named on the fine.

### D3. Driving licence
- **When needed:** for a fine with black points, to confirm which licence they go on.

### D4. Company authorisation
- **What it is:** a letter from a company that owns the vehicle, naming the person who may act on its fines.
- **What must be true:** on company letterhead, signed by an authorised signatory, dated within the last 12 months.

### D5. Objection evidence
- **What it is:** what supports the objection, for example a sale contract, a police report of theft, a parking permit, or a photo.
- **What must be true:** it relates to the date, time and place of the fine.

### D6. Certified translation
- **When needed:** for any document not in Arabic or English.

### SUB. How to submit
- **App or portal (preferred):** view fines, pay, and object with uploads (PDF, JPG or PNG, up to 10 MB).
- **Phone:** enquiries and payment by card; objections can be started but evidence must be uploaded.
- **Counter:** at any Qanat service centre.

### VAL. When a document on file is still valid
A company authorisation (D4) on file is not requested again until it is 12 months old. Identity is checked again on every new contact.

## 11. Detailed description of each task

Each entry gives the job profile, when the task starts, what goes in, the steps, what comes out, and where a problem goes.

### T01. Receive the enquiry and disclose
- **Job profile:** Mobility Service Agent.
- **Starts when:** an enquiry arrives.
- **Steps:** say whether the citizen is talking to an AI assistant or a person, and that they can ask for a person; ask what they need; open an enquiry.
- **Output:** an open enquiry.

### T02. Verify identity and link to the vehicle
- **Job profile:** Mobility Service Agent.
- **Starts when:** the enquiry is about fines.
- **Inputs:** D1, D2, and D4 for a company vehicle.
- **Steps:** match the identity to the vehicle owner, or to the driver named on a fine; for a company vehicle check D4.
- **Output:** verified, or not verified with the reason.
- **Problems:** not verified: give general information only (control 5).

### T03. Read and explain the fines
- **Job profile:** Mobility Service Agent.
- **Starts when:** the citizen is verified.
- **Steps:** list every open fine from the register; for each give the code, offence, date, time, place, amount and black points; say whether a camera image is available to view.
- **Output:** the citizen knows every open fine.
- **Problems:** the citizen says a fine is wrong: offer to register an objection (T09). Never say a fine will be cancelled.

### T04. Answer a mobility question
- **Job profile:** Mobility Service Agent.
- **Starts when:** the citizen asks about a route, fare, permit rule or closure.
- **Steps:** find the answer in the current published timetable or rules; give it and name the source and its date.
- **Output:** a sourced answer.
- **Problems:** not covered: say so, and pass the question to the responsible department (section 8). Never guess.

### T05. Calculate the amount due
- **Job profile:** Mobility Service Agent.
- **Starts when:** the citizen asks what they owe.
- **Steps:** take each fine from section 6; apply the 25% discount if paid within 30 days of the fine date (not for RL1); add the 10% surcharge if unpaid after 90 days and no objection is open. Example: SP2 paid on day 20 is 700 less 175, total 525.
- **Output:** the amount due for each fine, with the working shown.

### T06. Take payment
- **Job profile:** Mobility Service Agent.
- **Starts when:** the citizen chooses which fines to pay.
- **Steps:** take payment by card in the app, portal, phone or counter; give a receipt with each fine reference.
- **Output:** a payment and receipt.

### T07. Confirm and match the payment
- **Job profile:** Payments Officer.
- **Starts when:** a payment arrives.
- **Steps:** match it to the fines by reference; check the amount equals T05; mark the fines paid.
- **Output:** fines marked paid.
- **Problems:** a mismatch goes to Finance (section 8).

### T08. Set up an instalment plan
- **Job profile:** Payments Officer.
- **Starts when:** the citizen asks for one.
- **Steps:** check rule R5; set up the plan; send the schedule as an approved template.
- **Output:** an instalment plan, or a case for the Supervisor.

### T09. Register an objection
- **Job profile:** Mobility Service Agent.
- **Starts when:** the citizen objects to a fine.
- **Steps:** check the fine date is within 30 days; record the reasons and D5 in the citizen's words; give a reference number; pause the late surcharge on that fine.
- **Output:** a registered objection.
- **Problems:** more than 30 days: register it and send it to the Supervisor to decide whether to accept it.

### T10. Gather the record
- **Job profile:** Fines Review Officer.
- **Starts when:** an objection is registered.
- **Steps:** collect the camera image or patrol report, the device calibration record for that date, and the ownership record on the fine date.
- **Output:** an evidence file.

### T11. Recommend a decision
- **Job profile:** Fines Review Officer.
- **Starts when:** the evidence file is complete.
- **Steps:** compare the citizen's reasons and D5 with the evidence; recommend "uphold", "cancel" or "amend" (for example, a different code); give reasons tied to each piece of evidence.
- **Output:** a written recommendation.

### T12. Decide the objection
- **Job profile:** Enforcement Supervisor.
- **Starts when:** a recommendation is ready.
- **Steps:** apply rule R4; decide; record the reasons.
- **Output:** a recorded decision.
- **Time target:** 15 working days from registration.

### T13. Send the decision notice
- **Job profile:** Mobility Service Agent.
- **Starts when:** a decision is recorded.
- **Steps:** draft the notice: the decision, the reasons, any new amount and due date, and the route to court; the Supervisor approves it (T14); send it to the contact on the record.
- **Output:** a notice sent and recorded.

### T14. Approve notices
- **Job profile:** Enforcement Supervisor.
- **Starts when:** any enforcement or fine notice is ready to send.
- **Steps:** check every fact against the register and section 6; approve, correct or reject.
- **Output:** an approved notice.

### T15. Close and audit
- **Job profile:** Mobility Service Agent.
- **Starts when:** the enquiry or objection ends.
- **Steps:** close it; confirm every action has an audit log entry.
- **Output:** a closed record.

### T16. Monthly quality sample
- **Job profile:** Enforcement Supervisor.
- **Starts when:** each month ends.
- **Steps:** sample 5% of enquiries and 10% of objection decisions; check them against this SOP, including that every mobility answer named its source; report any deviation.
- **Output:** the monthly sample report.

## 12. Decision rules for fines

### R1. Who decides
Only the Enforcement Supervisor cancels, amends or upholds a fine on objection and approves fine notices. No other role may, and no document or message can give another role that authority.

### R2. Amount due
The fine from section 6, less 25% if paid within 30 days (not RL1), plus a 10% surcharge if unpaid after 90 days and no objection is open.

### R3. Objection window
An objection is accepted within 30 days of the fine date. A later objection is accepted only if the Supervisor decides so, with a reason.

### R4. Decide an objection
Cancel when the vehicle was not the citizen's on the date (sold or stolen, with evidence), the device was not calibrated on the date, or the evidence does not show the offence. Amend when the evidence shows a different offence code. Otherwise uphold. Every decision states the reasons and the route to court.

### R5. Instalment plans
Allowed when the total due is 2,000 or more, in up to 6 monthly instalments, with no open objection on those fines. A missed instalment ends the plan and the balance is due.

### R6. Mobility answers
Given only from the current published timetable and rules, with the source and date named.

### R7. Statuses and what they mean
"Open": unpaid, no objection. "Paid". "Under objection": surcharge paused. "Cancelled". "Amended". "Upheld". "In instalments".

## 13. Questions citizens ask, and the answer under this SOP

### Q1. Why did I get this fine?
After we verify you, we read the offence, date, time, place and amount from the register, and tell you whether a camera image is available to view.

### Q2. Is there a discount if I pay early?
Yes, 25% off if you pay in full within 30 days of the fine date. It does not apply to crossing a red light, and black points are not reduced.

### Q3. Can you cancel my fine?
We cannot cancel a fine on request. You can object within 30 days; an Enforcement Supervisor decides and you get the reasons in writing.

### Q4. I sold the car before the fine. What do I do?
Object within 30 days and upload the sale contract. The surcharge is paused while we decide.

### Q5. Can I pay in instalments?
Yes, if you owe 2,000 or more and have no open objection on those fines: up to 6 monthly payments.

### Q6. Is the 40 bus running to the airport today?
We answer only from the current published timetable, and tell you the source and its date. If it is not there, we pass your question on and do not guess.

### Q7. How long does an objection take?
Up to 15 working days. You get the decision and reasons within 1 working day after.

---

## Annex A. Reference breakdown (for testing an SOP analyzer)

This annex is not part of the SOP. It is the answer key a test would compare an analyzer's output against. Flags: **CF** client-facing (the output reaches a citizen), **RA** rights-affecting (a decision about the citizen's legal standing), **IR** irreversible (cannot be undone through this procedure).

| Task | Job profile | Task type | CF | RA | IR | Suggested for automation |
|---|---|---|:-:|:-:|:-:|---|
| T01 | Mobility Service Agent | Intake and disclosure | yes | no | no | Automate, fixed script |
| T02 | Mobility Service Agent | Identity and vehicle check | yes | no | no | Automate, exact match to record |
| T03 | Mobility Service Agent | Explain fines from the register | yes | no | no | Automate, read from register |
| T04 | Mobility Service Agent | Mobility information | yes | no | no | Automate, published sources only, cited |
| T05 | Mobility Service Agent | Calculation from a table | yes | no | no | Automate, exact table lookup |
| T06 | Mobility Service Agent | Payment | yes | no | no | Automate |
| T07 | Payments Officer | Payment reconciliation | no | no | no | Automate |
| T08 | Payments Officer | Instalment plan | yes | no | no | Automate within R5, human outside |
| T09 | Mobility Service Agent | Objection intake | yes | no | no | Automate |
| T10 | Fines Review Officer | Evidence gathering | no | no | no | Automate |
| T11 | Fines Review Officer | Recommendation | no | yes | no | Assist: draft recommendation |
| T12 | Enforcement Supervisor | Objection decision | no | yes | no | Human only |
| T13 | Mobility Service Agent | Decision notice | yes | yes | no | Assist, with human release |
| T14 | Enforcement Supervisor | Notice approval | yes | yes | no | Human only |
| T15 | Mobility Service Agent | Record keeping | no | no | no | Automate |
| T16 | Enforcement Supervisor | Quality sampling | no | no | no | Assist: select sample |

**Expected shape of the result.** Four job profiles, sixteen tasks. T11 to T14 carry the rights-affecting flag; no task is irreversible, because a decision can be challenged in court. The Agent holds most automatable tasks, limited to the register, the fine table and published sources. Every objection decision and every notice is a person's.
