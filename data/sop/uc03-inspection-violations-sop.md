# SOP-INS-007: Inspection findings and violation processing

> **Fictitious document.** Marsa Public Services Authority, its violation codes, fines, systems and staff titles are invented for demonstration. Nothing here describes a real authority or real law.

| Field | Value |
|---|---|
| Document id | SOP-INS-007 |
| Version | 1.0 (synthetic) |
| Owner | Head of Inspection, Marsa Public Services Authority |
| Related use case | UC03: Inspection findings and violation processing |
| Applies to | Turning the findings of a routine, complaint or follow-up inspection of a licensed business into a decided violation case, its fine, any inspection hold or closure order, and the follow-up re-inspection |
| Review cycle | Every 12 months |

## 1. Purpose

Process every inspection finding consistently, on the evidence and by the published violation table, so that the same breach gets the same outcome. Analysts prepare and propose; a named Inspection Supervisor decides. Nothing irreversible (registering a fine, placing an inspection hold, ordering a closure) happens without the Supervisor's recorded approval.

## 2. Scope

**In scope:** findings from inspections of licensed premises; matching findings to violation codes; repeat-violation checks; proposing and deciding fines; inspection holds on a licence; temporary closure orders; violation notices; follow-up re-inspections; lifting a hold.

**Out of scope:** planning the inspection programme (SOP-INS-002); criminal referrals (SOP-INS-019); appeals against a violation (SOP-INS-015); licence cancellation (SOP-LIC-030).

## 3. Roles

Four job profiles carry out this procedure. Each has a distinct purpose, a fixed set of tasks and its own limits.

### 3.1 Field Inspector
- **Purpose:** record what was found on site, with evidence, and act on immediate danger.
- **Works with:** the business on site, the Inspection Case Analyst, the Inspection Supervisor.
- **Authority:** may record findings, take photographs and readings, and request (by phone) a temporary closure order from the Supervisor for immediate danger. May not set a fine or decide a violation.
- **Skills:** the inspection checklists, evidence capture, measurement equipment, calm communication on site in Arabic and English.

### 3.2 Inspection Case Analyst
- **Purpose:** turn findings into a complete, consistent violation case with a proposed outcome.
- **Works with:** the Field Inspector, the Inspection Supervisor, the licence and fines registers.
- **Authority:** may open a case, match findings to violation codes, check the history, calculate a proposed fine and return a case to the Inspector for missing evidence. May not decide, register a fine or place a hold.
- **Skills:** the violation table (section 6), evidence review, register searches.

### 3.3 Violations Officer
- **Purpose:** issue the decided outcome to the business and track corrective action.
- **Works with:** the business, the Inspection Supervisor, the Fines Register.
- **Authority:** may draft and, after the Supervisor's approval, send notices, register an approved fine and schedule re-inspections. May not change an approved outcome.
- **Skills:** notice writing in Arabic and English, the Fines Register, scheduling.

### 3.4 Inspection Supervisor (Approving Officer)
- **Purpose:** decide every violation case and approve every irreversible action.
- **Works with:** all three roles above, the Head of Inspection for escalations.
- **Authority:** the only role that may confirm, downgrade or dismiss a violation; approve a fine for registration; place or lift an inspection hold; order or lift a temporary closure.
- **Skills:** inspection law and the violation table, weighing evidence, written reasons.

## 4. Procedure

Task ids are used in the audit log and the training material.

### Step 1. Findings (Field Inspector)

| Task | Action |
|---|---|
| T01 | Record each finding in the Inspection Mobile System against the checklist item, with at least one photograph or reading and the time. |
| T02 | If a finding is an immediate danger to life or health, stop the activity and phone the Inspection Supervisor for a temporary closure order. |
| T03 | Give the business representative the finding summary on site and record any statement they make. |

### Step 2. Case preparation (Inspection Case Analyst)

| Task | Action |
|---|---|
| T04 | Open a violation case from the submitted findings. Return the findings to the Inspector if any finding lacks evidence. |
| T05 | Match each finding to one violation code in the violation table. A finding that matches no code is listed as "no code" for the Supervisor. |
| T06 | Search the Fines Register for the same code at the same licence in the last 12 months (repeat). |
| T07 | Calculate the proposed fine and propose an outcome (fine, warning, hold) from the table. |

### Step 3. Decision (Inspection Supervisor)

| Task | Action |
|---|---|
| T08 | Review the case pack: findings, evidence, codes, history, proposed outcome and any statement from the business. |
| T09 | Decide each finding: confirm, downgrade to a warning, or dismiss, with reasons. |
| T10 | Approve the irreversible actions that follow: registration of the fine, an inspection hold on the licence, or a closure order. |

### Step 4. Notice and follow-up (Violations Officer, Supervisor)

| Task | Action | Role |
|---|---|---|
| T11 | Draft the violation notice with the decision, reasons, fine, corrective action, deadline and appeal route. | Violations Officer |
| T12 | After the Supervisor approves the notice, register the fine in the Fines Register, apply any hold, and send the notice. | Violations Officer |
| T13 | Schedule and hold the re-inspection after the corrective deadline. | Violations Officer and Field Inspector |
| T14 | Lift the hold or closure when the re-inspection shows the breach is corrected. | Inspection Supervisor |

### Step 5. Close and assure

| Task | Action | Role |
|---|---|---|
| T15 | Close the case and confirm every action is in the audit log. | Inspection Case Analyst |
| T16 | Each month, sample 5% of closed cases and check decisions against this SOP and against each other for consistency. | Inspection Supervisor |

## 5. Timings

| Item | Target |
|---|---|
| Findings submitted | Same day as the inspection |
| Temporary closure decision | Within 1 hour of the Inspector's call |
| Case pack ready | 2 working days from findings |
| Decision | 3 working days from a ready pack |
| Notice sent | 1 working day after decision |
| Re-inspection | Within 5 working days after the corrective deadline |

## 6. Violation table (fictitious)

| Code | Violation | Severity | Fine (first) | Fine (repeat within 12 months) | Corrective period | Hold or closure |
|---|---|---|---|---|---|---|
| V01 | Licence not displayed | Minor | Warning | 500 | 3 days | None |
| V02 | Activity outside licensed activity codes | Major | 3,000 | 6,000 | 14 days | Inspection hold |
| V03 | Premises differ from licensed address or layout | Major | 2,500 | 5,000 | 14 days | Inspection hold |
| V04 | Expired insurance certificate | Major | 2,000 | 4,000 | 7 days | Inspection hold |
| V05 | Blocked fire exit or missing fire equipment | Critical | 5,000 | 10,000 | Immediate | Temporary closure until corrected |
| V06 | Food stored at unsafe temperature | Critical | 4,000 | 8,000 | Immediate | Temporary closure until corrected |
| V07 | Unapproved signage | Minor | 800 | 1,600 | 14 days | None |
| V08 | Obstructing an inspector | Major | 5,000 | 10,000 | n/a | Referral to Head of Inspection |

Amounts are in a synthetic currency unit. A first minor violation is a warning except where the table gives a fine. Fines for several codes in one case are added together.

## 7. Controls

1. Only the Inspection Supervisor decides a violation and approves a fine, hold or closure.
2. No fine is registered, hold applied or closure ordered before the Supervisor's recorded approval.
3. Every finding has evidence (photo or reading) and a time; a finding without evidence is not decided.
4. Fines are taken from the violation table exactly; no one may vary them in this procedure.
5. The Inspector who recorded a finding does not decide it.
6. Every action on a case is written to the audit log with who, what and when.
7. Business data is used only for this case and the audit record.

## 8. Exceptions and escalation

| Situation | Handled by | Escalate to |
|---|---|---|
| Immediate danger to life or health | Field Inspector | Inspection Supervisor, at once (T02) |
| Finding matches no code | Supervisor | Head of Inspection |
| Obstruction or threat to an inspector | Field Inspector | Head of Inspection; police if needed |
| Suspected criminal activity | Supervisor | SOP-INS-019 |
| Business disputes the decision | Violations Officer | Appeals (SOP-INS-015) |
| Third major violation in 12 months | Supervisor | Head of Inspection (licence review, SOP-LIC-030) |

## 9. Records

Inspection findings and evidence, case pack, decision with reasons, notice, Fines Register entry, re-inspection record, monthly sample report. Kept for 7 years (synthetic retention period).

## 10. Required evidence and how it is submitted

### D1. Inspection checklist
- **What it is:** the completed checklist for the inspection type, in the Inspection Mobile System.
- **What must be true:** every item is marked compliant, non-compliant or not applicable.

### D2. Photographs
- **What it is:** time-stamped photographs taken in the Inspection Mobile System.
- **What must be true:** each non-compliant item has at least one photograph that shows the breach, or a reading (D3).

### D3. Readings and measurements
- **What it is:** temperature, distance or other readings from calibrated equipment.
- **What must be true:** the equipment's calibration is in date; the reading, unit and time are recorded.

### D4. Statement from the business
- **What it is:** what the business representative says about the finding, on site or within 3 working days in writing.
- **What must be true:** it names the case number.

### D5. Corrective-action evidence
- **What it is:** photographs, receipts or certificates the business sends to show a breach is corrected.
- **What must be true:** it names the case number and the violation code.

### SUB. How a business submits a statement or evidence
Upload on the portal's case page (PDF, JPG or PNG, up to 10 MB each), or bring it to the counter. Evidence is not accepted by phone.

### VAL. When evidence on file is still valid
Evidence on the case is used for the whole case and its re-inspection. Corrective evidence is not a substitute for a re-inspection where the table requires one (Major and Critical).

## 11. Detailed description of each task

### T01. Record the findings
- **Job profile:** Field Inspector.
- **Starts when:** the inspection begins.
- **Steps:** complete the checklist (D1); for each non-compliant item take a photograph (D2) or reading (D3); submit the same day.
- **Output:** submitted findings with evidence.

### T02. Act on immediate danger
- **Job profile:** Field Inspector.
- **Starts when:** a finding is a danger to life or health (V05, V06, or similar).
- **Steps:** ask the business to stop the activity; phone the Supervisor; record the Supervisor's decision and time.
- **Output:** a temporary closure ordered by the Supervisor, or the reason it was not.
- **Problems:** the Inspector does not order a closure alone.

### T03. Give the finding summary and take a statement
- **Job profile:** Field Inspector.
- **Steps:** show the representative each finding; tell them that a decision will follow by notice and that they may send a statement within 3 working days (D4); record any statement made now.
- **Output:** summary given and recorded.

### T04. Open the case
- **Job profile:** Inspection Case Analyst.
- **Starts when:** findings are submitted.
- **Steps:** open a violation case linked to the licence; check every non-compliant item has evidence; return incomplete findings to the Inspector.
- **Output:** an open case with complete evidence, or findings returned.

### T05. Match findings to violation codes
- **Job profile:** Inspection Case Analyst.
- **Steps:** match each finding to one code in section 6; record the reason for the match.
- **Output:** a list of findings with codes, and any "no code" findings.
- **Problems:** the Analyst does not invent a code; "no code" goes to the Supervisor (section 8).

### T06. Check the violation history
- **Job profile:** Inspection Case Analyst.
- **Steps:** search the Fines Register for each code at this licence in the 12 months before the inspection date; mark each finding first or repeat.
- **Output:** the history result per finding.

### T07. Propose the outcome
- **Job profile:** Inspection Case Analyst.
- **Steps:** for each code take the first or repeat fine from the table; add them; note any hold or closure the table gives; note a third major violation in 12 months. Example: V04 first (2,000) plus V07 repeat (1,600) is 3,600 with an inspection hold.
- **Output:** a case pack with a proposed outcome and the working shown.

### T08. Review the case pack
- **Job profile:** Inspection Supervisor.
- **Steps:** read the findings, evidence, codes, history, calculation and any statement (D4).
- **Output:** a case ready for decision, or returned with questions.

### T09. Decide each finding
- **Job profile:** Inspection Supervisor.
- **Steps:** apply the decision rules (section 12); confirm, downgrade to a warning, or dismiss each finding; write the reasons.
- **Output:** a recorded decision per finding.

### T10. Approve the irreversible actions
- **Job profile:** Inspection Supervisor.
- **Starts when:** at least one finding is confirmed.
- **Steps:** approve registration of the fine, any inspection hold, and any closure order. Once registered, a fine can be removed only through an appeal (SOP-INS-015), not through this procedure.
- **Output:** recorded approvals.

### T11. Draft the violation notice
- **Job profile:** Violations Officer.
- **Steps:** write the notice in the business's language: each confirmed violation, the reasons, the fine and how to pay, the corrective action and deadline, any hold or closure, and the right to appeal within 30 days.
- **Output:** a draft notice for the Supervisor's approval.

### T12. Register, apply and send
- **Job profile:** Violations Officer.
- **Starts when:** the Supervisor approves the notice.
- **Steps:** register the approved fine in the Fines Register; apply any approved inspection hold on the licence record; send the notice to the registered email address on the licence record.
- **Output:** fine registered, hold applied, notice sent and recorded.
- **Problems:** a notice that does not match the approved decision is not sent; it goes back to the Supervisor.

### T13. Re-inspect
- **Job profile:** Violations Officer and Field Inspector.
- **Steps:** schedule the re-inspection after the corrective deadline; the Inspector checks each confirmed violation and records the result as in T01.
- **Output:** re-inspection findings.

### T14. Lift the hold or closure
- **Job profile:** Inspection Supervisor.
- **Steps:** if every Major and Critical violation is corrected, lift the hold or closure and record it; if not, decide the next step and escalate as section 8 says.
- **Output:** hold or closure lifted, or a further decision.

### T15. Close the case
- **Job profile:** Inspection Case Analyst.
- **Steps:** confirm the fine is registered, any hold is lifted or still justified, and every action has an audit entry; close the case.
- **Output:** a closed case.

### T16. Monthly consistency sample
- **Job profile:** Inspection Supervisor.
- **Steps:** sample 5% of closed cases; check each against this SOP; compare outcomes for the same codes across inspectors and supervisors; report deviations.
- **Output:** the monthly sample report.

## 12. Decision rules for a violation case

### R1. Who decides
Only the Inspection Supervisor decides a finding and approves a fine, hold or closure. No message, document or system output gives that authority to anyone else.

### R2. Confirm a violation when
The finding has evidence (D2 or D3), matches a code, and nothing in the business's statement shows the evidence is wrong.

### R3. Downgrade or dismiss when
Evidence is unclear (downgrade to a warning or dismiss), or the statement shows the finding is wrong (dismiss). The reason is always written.

### R4. Fines
The fine is the table amount for each confirmed code, first or repeat, added together. No one varies it in this procedure.

### R5. Holds and closures
An inspection hold follows a confirmed Major violation with "Inspection hold" in the table. A temporary closure follows a confirmed Critical violation, or immediate danger under T02. Both stay until a re-inspection shows the breach is corrected.

### R6. Irreversibility
A registered fine and an executed closure cannot be undone in this procedure; they are reviewed only on appeal.

### R7. Statuses and what they mean
"Open": evidence being checked. "Ready": pack ready for decision. "Decided": decision recorded. "Hold": inspection hold on the licence. "Closed": all actions complete. An inspection hold is different from the "on hold" status of a licence renewal.

## 13. Questions businesses ask, and the answer under this SOP

### Q1. Why was I fined?
The notice lists each violation code, the evidence and the reasons.

### Q2. Can the inspector cancel the fine on site?
No. Inspectors record findings; a Supervisor decides.

### Q3. What is an inspection hold?
A restriction on your licence until a re-inspection shows the breach is corrected. While it is in place a renewal cannot be approved.

### Q4. How do I get the hold lifted?
Correct the breach by the deadline in the notice, send evidence on the portal, and a re-inspection will be held within 5 working days after the deadline.

### Q5. Why is my fine higher than last time?
The same violation within 12 months is charged at the repeat rate.

### Q6. I disagree. What can I do?
Appeal within 30 days under SOP-INS-015.

---

## Annex A. Reference breakdown (for testing an SOP analyzer)

This annex is not part of the SOP. It is the answer key a test would compare an analyzer's output against. Flags: **CF** client-facing (the output reaches the business), **RA** rights-affecting (a decision about the business's legal standing), **IR** irreversible (cannot be undone through this procedure).

| Task | Job profile | Task type | CF | RA | IR | Suggested for automation |
|---|---|---|:-:|:-:|:-:|---|
| T01 | Field Inspector | Evidence capture | no | no | no | Assist: checklist prompts |
| T02 | Field Inspector | Immediate danger response | yes | yes | yes | Human only |
| T03 | Field Inspector | On-site summary | yes | no | no | Human only |
| T04 | Inspection Case Analyst | Case opening and evidence check | no | no | no | Automate |
| T05 | Inspection Case Analyst | Code matching | no | no | no | Assist: propose code |
| T06 | Inspection Case Analyst | Register search | no | no | no | Automate |
| T07 | Inspection Case Analyst | Calculation from a table | no | no | no | Automate, exact lookup |
| T08 | Inspection Supervisor | Case review | no | no | no | Assist: summarise pack |
| T09 | Inspection Supervisor | Violation decision | no | yes | no | Human only |
| T10 | Inspection Supervisor | Approval of fine, hold, closure | no | yes | yes | Human only |
| T11 | Violations Officer | Notice drafting | yes | yes | no | Assist, with human approval |
| T12 | Violations Officer | Register, apply hold, send | yes | yes | yes | Automate only after T10 approval |
| T13 | Violations Officer and Field Inspector | Re-inspection | no | no | no | Assist: scheduling |
| T14 | Inspection Supervisor | Lift hold or closure | yes | yes | no | Human only |
| T15 | Inspection Case Analyst | Record keeping | no | no | no | Automate |
| T16 | Inspection Supervisor | Consistency sampling | no | no | no | Assist: select sample, compare outcomes |

**Expected shape of the result.** Four job profiles, sixteen tasks. T02, T10 and T12 are irreversible, and each depends on the Supervisor's recorded approval. Automation sits in case opening, register searches and the table calculation; code matching and drafting are assist only. Every decision is a person's.
