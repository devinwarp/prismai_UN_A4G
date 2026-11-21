# SOP-LIC-014: Trade licence renewal and permit pre-check

> **Fictitious document.** Marsa Public Services Authority, its fees, forms, deadlines and staff titles are invented for demonstration. Nothing here describes a real authority or real law.

| Field | Value |
|---|---|
| Document id | SOP-LIC-014 |
| Version | 2.3 (synthetic) |
| Owner | Head of Licensing, Marsa Public Services Authority |
| Related use case | UC02: Trade licence renewal and permit pre-check |
| Applies to | Renewal of an existing commercial trade licence, including the permit pre-check that comes before it |
| Review cycle | Every 12 months |

## 1. Purpose

Renew trade licences on time and accurately, and make sure every applicant gets a clear decision with reasons. The procedure also covers the pre-check that confirms an application is complete before a licence officer spends time on it.

## 2. Scope

**In scope:** renewals of licences that are active or within the 30-day grace period, a pre-check of documents and records, fee calculation and collection, decision and issue of the renewed licence, and notice to the applicant.

**Out of scope:** new licences, changes of legal owner, licence cancellation, and appeals (handled by SOP-LIC-021).

## 3. Roles

Four job profiles carry out this procedure. Each has a distinct purpose, a fixed set of tasks and its own limits.

### 3.1 Licensing Front-Desk Officer
- **Purpose:** be the applicant's point of contact and open a complete case.
- **Works with:** applicants (counter, portal and phone), the Document Verification Analyst.
- **Authority:** may open, update and close the intake part of a case. May not decide, waive fees or alter a licence.
- **Skills:** applicant communication in English and Arabic, identity checking, case-system entry.

### 3.2 Document Verification Analyst
- **Purpose:** decide whether the file is complete and consistent, and flag anything that blocks renewal.
- **Works with:** applicants (by email, for missing information), the Fee and Payment Officer, registry and fines systems.
- **Authority:** may mark a file "complete", "on hold" or "blocked". May email an applicant about missing information. May not approve or reject a renewal.
- **Skills:** reading lease, insurance and identity documents, record matching, knowing the approved activity codes, writing a clear request to an applicant in English and Arabic.

### 3.3 Fee and Payment Officer
- **Purpose:** state the correct fee and confirm it has been paid.
- **Works with:** the Verification Analyst, the finance system, applicants.
- **Authority:** may calculate fees from the published fee table and confirm receipt. May not waive, reduce or refund any fee.
- **Skills:** the fee table, late-fee rules, payment reconciliation.

### 3.4 Licensing Supervisor (Approving Officer)
- **Purpose:** make the renewal decision and issue the licence.
- **Works with:** all three roles above, the Head of Licensing for escalations.
- **Authority:** the only role that may approve, reject or issue a licence, handle exceptions, and approve a fee waiver request (sent on to finance).
- **Skills:** licensing rules, judgement on exceptions, writing decision notices that give reasons.

## 4. Procedure

Task ids are used in the audit log and the training material.

### Step 1. Intake (Front-Desk Officer)

| Task | Action |
|---|---|
| T01 | Receive the renewal request from the portal, counter or phone. Open a case and give the applicant the case number. |
| T02 | Confirm the applicant's identity against the licence holder or an authorised representative's letter. |
| T03 | Tell the applicant, in their language, which documents are required and the next expected steps. |

### Step 2. Pre-check (Document Verification Analyst)

| Task | Action |
|---|---|
| T04 | Retrieve the licence record and note the expiry date. If expired for more than 30 days, mark the case "blocked: outside grace period" and go to Step 4. |
| T05 | Check the file holds all required documents: trade name certificate, current lease, owner identity, insurance certificate. |
| T06 | Check the lease is valid for at least the renewal period and that the licensed address matches it. |
| T07 | Check the registry for unpaid fines or inspection holds on the licence. |
| T08 | Check the licensed activity codes are unchanged from those on record. A change goes to Step 4 as an exception. |
| T09 | Mark the file "complete", "on hold" or "blocked". For "on hold", list exactly what is missing. "Blocked" is used only for a case outside the grace period (T04). |
| T10 | If the file is incomplete (marked "on hold" in T09), send an email to the applicant's registered email address on the licence record. The email lists exactly what is missing, asks the applicant to send it, and states that the application is "on hold" because of missing information until it is received. |

### Step 3. Fees (Fee and Payment Officer)

| Task | Action |
|---|---|
| T11 | Calculate the renewal fee from the published fee table: the base fee for the activity group plus the late fee (see section 6). |
| T12 | Send the fee notice to the applicant with the amount and how to pay. |
| T13 | Confirm payment has arrived in the finance system and match it to the case. A mismatch goes to the Supervisor. |

### Step 4. Decision and issue (Licensing Supervisor)

| Task | Action |
|---|---|
| T14 | Review the pre-check pack and the fee confirmation. |
| T15 | Decide: approve, reject, or request more information. A rejection must state the reason and the applicant's right to appeal. |
| T16 | Handle exceptions: outside the grace period, changed activity, unpaid fines, payment mismatch, or a fee waiver request. Record the reason for each exception decision. |
| T17 | Issue the renewed licence. An issued licence cannot be withdrawn through this procedure; any later change is a separate cancellation or amendment. |
| T18 | Send the decision notice to the applicant: the renewed licence, or the rejection with reasons and appeal route. |

### Step 5. Close and assure

| Task | Action | Role |
|---|---|---|
| T19 | Update the licence record and write the case to the audit log. | Front-Desk Officer |
| T20 | Each month, sample 5% of closed cases and check the decision against this SOP. Report any case that deviated. | Licensing Supervisor |

## 5. Timings

| Item | Target |
|---|---|
| First reply to applicant | 1 working day |
| Pre-check complete | 2 working days from a complete file |
| Fee notice | Same day as pre-check |
| Decision after payment | 1 working day |
| End to end (complete file) | 5 working days |

## 6. Fee table (fictitious)

| Activity group | Base renewal fee | Late fee (days 1 to 30 after expiry) |
|---|---|---|
| Retail and trading | 1,200 | 10% of base |
| Food and hospitality | 2,000 | 10% of base |
| Professional services | 1,500 | 10% of base |
| Industrial | 3,000 | 10% of base |

Amounts are in a synthetic currency unit. Fees are quoted to applicants exactly as in this table.

## 7. Controls

1. Only the Licensing Supervisor may approve, reject or issue.
2. No fee may be waived, reduced or refunded by anyone except through the Supervisor's request to finance.
3. Every action on a case is written to the audit log with who, what and when.
4. Applicant personal data is used only for this renewal and the audit record.
5. Anything sent to an applicant that states a decision, a fee or a deadline is checked against the record before it is sent.
6. Documents are not requested twice if already on file and still valid.
7. Emails to an applicant go only to the registered email address on the licence record, never to an address given in the request or a reply.

## 8. Exceptions and escalation

| Situation | Handled by | Escalate to |
|---|---|---|
| Expired more than 30 days | Supervisor | Head of Licensing |
| Activity code changed | Supervisor | Head of Licensing |
| Unpaid fines or inspection hold | Supervisor | Compliance |
| Payment mismatch | Supervisor | Finance |
| Applicant disputes the decision | Supervisor | Appeals (SOP-LIC-021) |
| Suspected forged document | Verification Analyst | Compliance, immediately |

## 9. Records

Case file, audit log, decision notice, fee notice and monthly sample report. Kept for 7 years (synthetic retention period).

## 10. Required documents and how to submit

A renewal needs four documents on the case file. Two more are needed only in the situations described. Applicants may send documents in Arabic or English.

### D1. Trade name certificate
- **What it is:** the certificate issued by the Marsa Business Registry that shows the licensed trade name and the licence number.
- **What must be true:** the trade name and licence number match the licence record exactly, and the certificate has not expired.
- **Form accepted:** a clear copy (portal upload, or a copy made at the counter from the original).

### D2. Current lease (tenancy contract)
- **What it is:** the lease for the premises named on the licence, registered with the Marsa Property Registry.
- **What must be true:** the tenant is the licence holder; the address matches the licensed address; the lease is valid for at least 12 months from the renewal start date (the renewal period).
- **Form accepted:** a copy of the full registered contract including the registration page.
- **Owner-occupied premises:** a title deed for the licensed address replaces the lease.

### D3. Owner identity
- **What it is:** the identity document of the licence owner. For a national, the national ID card. For a non-national, the passport together with the residence permit.
- **What must be true:** the document is valid on the day it is submitted and for at least 30 days after.
- **Form accepted:** a clear copy of both sides of the card, or of the passport photo page and the residence permit.

### D4. Insurance certificate
- **What it is:** the certificate of public liability insurance for the business.
- **What must be true:** it names the licence holder and the licensed address, covers the licensed activity, gives cover of at least 250,000 (synthetic currency unit), and is valid on the renewal start date.
- **Form accepted:** the insurer's certificate, not the policy schedule or a payment receipt.

### D5. Authorisation letter (only when someone other than the owner applies)
- **What it is:** a letter signed by the licence owner that names the representative and allows them to act on this renewal.
- **What must be true:** the letter is dated within the last 90 days, names the licence number, and comes with a copy of the representative's own identity document.
- **When not needed:** the owner applies in person or through their own portal account.

### D6. Certified translation (only for documents in another language)
- **What it is:** a translation into Arabic or English by a translator registered with Marsa.
- **What must be true:** the translation is stamped and attached to the original. A document in a language other than Arabic or English is not accepted without it.

### SUB. How to submit documents
- **Portal (preferred):** open the case page with the case number and upload each document. Accepted file types are PDF, JPG and PNG, up to 10 MB per file. Scans must be in colour, show all four corners and be readable.
- **Counter:** show the originals to the Front-Desk Officer, who scans them into the case and returns the originals at once.
- **Reply to the notice email:** attachments sent in reply to an email from the Authority are added to the case if the case number is in the subject. A reply never changes the registered email address.
- **Phone:** a case can be opened by phone, but documents cannot be submitted by phone.
- **Changing the registered email address:** only at the counter, with the owner's identity document. It cannot be changed by a request, an email or a form on the portal.
- **Earliest and latest submission:** a renewal can be submitted from 60 days before the expiry date. After expiry there is a 30-day grace period with a late fee. After the grace period the renewal cannot go ahead through this procedure (see section 12, rule R6).

### VAL. When a document on file is still valid
A document already on the case file, or on the licence record from the last renewal, is not requested again if all of these are true: it has not expired; it is the type listed above for this renewal; and the details on it (name, address, licence number, activity) still match the licence record. If any one fails, the applicant is asked for a new copy of that document only.

## 11. Detailed description of each task

Each entry gives the job profile, when the task starts, what goes in, the steps, what comes out, and where a problem goes.

### T01. Receive the request and open a case
- **Job profile:** Licensing Front-Desk Officer.
- **Starts when:** a renewal request arrives by portal, counter or phone.
- **Inputs:** the licence number or trade name, the applicant's name and contact details.
- **Steps:** find the licence on the system; check that it is a licence the Authority renews (not a new application, change of owner or cancellation); open a case; give the applicant the case number in the same contact.
- **Output:** an open case with a case number held by the applicant.
- **Time target:** first reply within 1 working day.
- **Problems:** if the request is out of scope (section 2), tell the applicant which procedure applies and close the case with that reason.

### T02. Confirm the applicant's identity
- **Job profile:** Licensing Front-Desk Officer.
- **Starts when:** a case is open.
- **Inputs:** the applicant's identity document (D3) or, for a representative, the authorisation letter (D5) and the representative's identity document.
- **Steps:** compare the person or the submitted identity with the licence holder on the record; for a representative, check the letter is signed by the owner, dated within 90 days and names the licence number; note the result on the case.
- **Output:** identity recorded as confirmed, or as not confirmed with the reason.
- **Problems:** if identity cannot be confirmed, do not continue the case; tell the applicant what is needed. A document that looks altered or false is handled under section 8, "Suspected forged document".

### T03. Tell the applicant what is required and what happens next
- **Job profile:** Licensing Front-Desk Officer.
- **Starts when:** identity is confirmed.
- **Inputs:** the case, the list of required documents (section 10), the applicant's language.
- **Steps:** tell the applicant, in Arabic or English as they prefer, which documents are needed (D1 to D4, and D5 or D6 if they apply), how to submit them (SUB), the fee and the late fee if the licence has expired, and the expected steps and timings (section 5). Do not ask for a document that is still valid on the file (VAL).
- **Output:** the applicant has been told the document list, how to submit, and the next steps.
- **Problems:** a question the Front-Desk Officer cannot answer from this SOP goes to the Licensing Supervisor.

### T04. Retrieve the licence record and apply the date rule
- **Job profile:** Document Verification Analyst.
- **Starts when:** the case is passed from intake.
- **Inputs:** the licence record, today's date.
- **Steps:** read the expiry date from the licence record. If the licence is active, or expired by 30 days or fewer, continue. If it expired more than 30 days ago, mark the case "blocked: outside grace period" and go to T16 (Step 4). Note whether the late fee will apply (expired by 1 to 30 days).
- **Output:** the expiry date, the late-fee flag, or a "blocked: outside grace period" case.
- **Problems:** an expiry date that looks wrong (for example, earlier than the issue date) is sent to the Supervisor as a payment or record exception.

### T05. Check the file holds all required documents
- **Job profile:** Document Verification Analyst.
- **Starts when:** the date rule allows the case to continue.
- **Inputs:** the case file and section 10.
- **Steps:** check for D1, D2, D3 and D4; check D5 if someone other than the owner applied; check D6 for any document not in Arabic or English; skip a document that is still valid on the file (VAL); list each missing or unreadable document by name.
- **Output:** a list of present documents and a list of missing ones.
- **Problems:** a document that appears forged is not marked missing. Stop, and escalate to Compliance immediately (section 8).

### T06. Check the lease and the licensed address
- **Job profile:** Document Verification Analyst.
- **Starts when:** the lease (D2) is on file.
- **Inputs:** D2 and the licence record.
- **Steps:** confirm the tenant is the licence holder; confirm the address on the lease matches the licensed address; confirm the lease runs for at least 12 months from the renewal start date; confirm it is registered with the Marsa Property Registry.
- **Output:** the lease accepted, or a list of what does not match.
- **Problems:** a lease shorter than 12 months, or an address mismatch, makes the file "on hold" with the exact difference stated (T09).

### T07. Check the registry for unpaid fines and inspection holds
- **Job profile:** Document Verification Analyst.
- **Starts when:** the licence number is known.
- **Inputs:** the fines register and the inspection register.
- **Steps:** look up the licence number in both registers; record any unpaid fine with its amount and any inspection hold with its reason.
- **Output:** "no fines or holds", or a list of them.
- **Problems:** an unpaid fine or an inspection hold goes to the Supervisor as an exception (T16) and on to Compliance (section 8). An inspection hold is a restriction placed by an inspector; it is not the "on hold" status used for missing information.

### T08. Check the licensed activity codes
- **Job profile:** Document Verification Analyst.
- **Starts when:** the licence record and documents are on file.
- **Inputs:** the activity codes on the licence record and the activity shown on D1 and D4.
- **Steps:** compare the codes and the activity group; the activity group decides the base fee (section 6).
- **Output:** "codes unchanged", or a changed-activity note.
- **Problems:** a change of activity code is an exception (T16) and goes to Head of Licensing.

### T09. Mark the file "complete", "on hold" or "blocked"
- **Job profile:** Document Verification Analyst.
- **Starts when:** T04 to T08 are done.
- **Steps:** mark the file "complete" if every required document is present and valid and there are no mismatches; mark it "on hold" if something is missing or does not match, listing exactly what; mark it "blocked" only for a case outside the grace period (T04).
- **Output:** a status on the case, and for "on hold" a list of the missing or mismatched items.
- **Problems:** the Analyst does not approve or reject; that is the Supervisor's decision (rule R1).

### T10. Email the applicant when the file is on hold
- **Job profile:** Document Verification Analyst.
- **Starts when:** T09 marks the file "on hold".
- **Inputs:** the list of missing or mismatched items; the registered email address on the licence record.
- **Steps:** send an email to the registered email address on the licence record (control 7). The email lists exactly what is missing, asks the applicant to send it (see SUB), and says the application is "on hold" because of missing information until it is received. Write in Arabic or English according to the applicant's language on the record. Check the content against the case before sending (control 5).
- **Output:** a sent email recorded on the case. When the missing items arrive, the Analyst repeats T05 to T09.
- **Problems:** if the registered email address bounces, tell the Front-Desk Officer, who contacts the applicant by phone and asks them to update the address at the counter.

### T11. Calculate the renewal fee
- **Job profile:** Fee and Payment Officer.
- **Starts when:** the file is "complete".
- **Inputs:** the activity group from T08, the late-fee flag from T04, the fee table (section 6).
- **Steps:** take the base fee for the activity group; if the licence expired 1 to 30 days ago, add the late fee of 10% of the base fee (a single charge, not per day); add them for the total. Example: Food and hospitality, 12 days after expiry, is 2,000 plus 200, total 2,200.
- **Output:** a fee amount with the working shown.
- **Problems:** a request to waive or reduce a fee is not decided here; it goes to the Supervisor (rule R5).

### T12. Send the fee notice
- **Job profile:** Fee and Payment Officer.
- **Starts when:** the fee is calculated.
- **Steps:** send the applicant the fee amount, the due date and how to pay: by card on the portal, by bank transfer quoting the case number as the reference, or by card at the counter. The notice is valid for 14 calendar days. Check the amount against the fee table before sending (control 5).
- **Output:** a fee notice sent and recorded on the case, on the same day as the pre-check is complete.

### T13. Confirm payment and match it to the case
- **Job profile:** Fee and Payment Officer.
- **Starts when:** the applicant says they have paid, or the finance system shows a payment.
- **Steps:** find the payment in the finance system by case number; check the amount equals the fee in T11; record the payment on the case.
- **Output:** payment confirmed and matched.
- **Problems:** a payment with a different amount, no case number, or the wrong payer is a payment mismatch and goes to the Supervisor (T16) and on to Finance.

### T14. Review the pre-check pack and the fee confirmation
- **Job profile:** Licensing Supervisor.
- **Starts when:** the file is "complete" and the payment is matched.
- **Steps:** read the pack: identity result, documents, registry check, activity check, fee and payment. Check that nothing in the pack needs an exception.
- **Output:** a case ready for decision, or a case sent to T16.

### T15. Decide: approve, reject, or request more information
- **Job profile:** Licensing Supervisor.
- **Starts when:** T14 is done.
- **Steps:** apply the decision rules in section 12. Approve, reject, or request more information. A rejection states the reason and the applicant's right to appeal within 30 days under SOP-LIC-021.
- **Output:** a recorded decision with reasons.
- **Problems:** only the Licensing Supervisor decides (rule R1).

### T16. Handle exceptions
- **Job profile:** Licensing Supervisor.
- **Starts when:** a case is outside the grace period, has a changed activity code, has an unpaid fine or inspection hold, has a payment mismatch, or includes a fee waiver request.
- **Steps:** decide the exception, record the reason, and escalate as section 8 says (Head of Licensing, Compliance, Finance). A fee waiver request is approved or refused by the Supervisor and, if approved, sent on to finance. No one else waives, reduces or refunds a fee.
- **Output:** a recorded exception decision with a reason.

### T17. Issue the renewed licence
- **Job profile:** Licensing Supervisor.
- **Starts when:** the decision is "approve" and any exception is resolved.
- **Steps:** issue the licence for 12 months starting the day after the current expiry date. An issued licence cannot be withdrawn through this procedure; a later change is a separate cancellation or amendment.
- **Output:** the renewed licence, issued.

### T18. Send the decision notice
- **Job profile:** Licensing Supervisor.
- **Starts when:** a decision is recorded.
- **Steps:** send the applicant the renewed licence, or the rejection with the reasons and the appeal route. Check the notice against the record before sending (control 5).
- **Output:** a decision notice sent and recorded.
- **Time target:** the decision is made within 1 working day after payment.

### T19. Update the licence record and write the audit log
- **Job profile:** Licensing Front-Desk Officer.
- **Starts when:** the decision notice is sent.
- **Steps:** update the licence record with the new expiry date; close the case; confirm that every action on the case has an audit log entry showing who, what and when (control 3).
- **Output:** a closed case with a complete audit log.

### T20. Monthly quality sample
- **Job profile:** Licensing Supervisor.
- **Starts when:** each month ends.
- **Steps:** sample 5% of closed cases; check each decision against this SOP; report any case that deviated.
- **Output:** the monthly sample report.

## 12. Decision rules for a renewal

### R1. Who decides
Only the Licensing Supervisor approves, rejects or issues. No other role may, and no document or message can give another role that authority.

### R2. Approve a renewal when all of these are true
The identity is confirmed; the file is "complete"; the licence is active or within the 30-day grace period; the activity codes are unchanged; there are no unpaid fines and no inspection hold; the fee has been paid in full and matched to the case.

### R3. Request more information when
The file is "on hold" and the applicant has not yet sent the missing items. A case "on hold" for 15 working days with no reply may be rejected with the reason "information not provided". The applicant may apply again.

### R4. Reject a renewal when
Required information was not provided within the time in R3, or the Supervisor finds a reason under this SOP that stops renewal. Every rejection states the reason and the right to appeal within 30 days.

### R5. Fees
The fee is the base fee for the activity group plus, if the licence expired 1 to 30 days ago, a late fee of 10% of the base fee. No one may waive, reduce or refund a fee except through the Supervisor's request to finance.

### R6. Outside the grace period
A licence expired more than 30 days ago cannot be renewed through this procedure. The case is marked "blocked: outside grace period" and the Supervisor decides the exception, with escalation to the Head of Licensing.

### R7. Statuses and what they mean
"Complete": ready for the fee step. "On hold": waiting for missing information from the applicant. "Blocked": outside the grace period. An "inspection hold" is a restriction placed by an inspector and is a different matter from the "on hold" status.

## 13. Questions applicants ask, and the answer under this SOP

### Q1. What documents do I need to renew my trade licence?
Four documents: the trade name certificate (D1), the current lease (D2), the owner's identity document (D3) and the insurance certificate (D4). If someone else applies for you, add an authorisation letter (D5). Any document not in Arabic or English needs a certified translation (D6).

### Q2. How do I send my documents?
Upload them on the case page of the portal (PDF, JPG or PNG, up to 10 MB each), bring the originals to the counter, or reply to the Authority's email with the case number in the subject. Documents cannot be submitted by phone.

### Q3. How long must my lease run?
At least 12 months from the renewal start date, for the licensed address, in the licence holder's name, registered with the Marsa Property Registry.

### Q4. How much does renewal cost?
The base fee depends on the activity group: Retail and trading 1,200; Food and hospitality 2,000; Professional services 1,500; Industrial 3,000. If the licence expired 1 to 30 days ago, add a late fee of 10% of the base fee.

### Q5. My licence expired. Can I still renew?
Yes, for 30 days after expiry, with the late fee. After 30 days the case is blocked and a Supervisor decides whether an exception is possible.

### Q6. My application says "on hold". What does that mean?
The Authority is missing information. You will get an email at your registered address listing exactly what is missing. Send it and the case continues. If nothing arrives within 15 working days the application may be rejected, and you may apply again.

### Q7. How do I change my registered email address?
Only at the counter, with the owner's identity document. The Authority does not change it on request by email, phone or the portal.

### Q8. How long does renewal take?
Five working days from a complete file: the pre-check within 2 working days, the fee notice the same day, and the decision within 1 working day after payment.

### Q9. Can the Authority waive or reduce the fee?
Not at the front desk or in the pre-check. A waiver request is decided by the Licensing Supervisor and, if approved, passed on to finance.

### Q10. My application was rejected. What can I do?
The notice gives the reason. You may appeal within 30 days under SOP-LIC-021, or apply again.

---

## Annex A. Reference breakdown (for testing an SOP analyzer)

This annex is not part of the SOP. It is the answer key a test would compare an analyzer's output against. Flags: **CF** client-facing (the output reaches an applicant), **RA** rights-affecting (a decision about the applicant's legal standing), **IR** irreversible (cannot be undone through this procedure).

| Task | Job profile | Task type | CF | RA | IR | Suggested for automation |
|---|---|---|:-:|:-:|:-:|---|
| T01 | Front-Desk Officer | Intake and communication | yes | no | no | Assist: draft acknowledgement |
| T02 | Front-Desk Officer | Identity check | yes | no | no | Human: judgement on identity |
| T03 | Front-Desk Officer | Information to applicant | yes | no | no | Assist, with human release |
| T04 | Verification Analyst | Record lookup and date rule | no | no | no | Automate |
| T05 | Verification Analyst | Document completeness check | no | no | no | Automate |
| T06 | Verification Analyst | Document consistency check | no | no | no | Automate, human samples |
| T07 | Verification Analyst | Registry lookup | no | no | no | Automate |
| T08 | Verification Analyst | Record comparison | no | no | no | Automate |
| T09 | Verification Analyst | Classification of the file | no | no | no | Assist: propose status |
| T10 | Verification Analyst | Email to applicant: missing information, application on hold | yes | no | no | Assist, with human release |
| T11 | Fee and Payment Officer | Calculation from a table | no | no | no | Automate, exact table lookup |
| T12 | Fee and Payment Officer | Fee notice to applicant | yes | no | no | Assist, with human release |
| T13 | Fee and Payment Officer | Payment reconciliation | no | no | no | Automate |
| T14 | Licensing Supervisor | Review | no | no | no | Assist: summarise pack |
| T15 | Licensing Supervisor | Decision | yes | yes | no | Human only |
| T16 | Licensing Supervisor | Exception handling | no | yes | no | Human only |
| T17 | Licensing Supervisor | Issue licence | no | yes | yes | Human only |
| T18 | Licensing Supervisor | Decision notice to applicant | yes | yes | no | Assist, with human release |
| T19 | Front-Desk Officer | Record keeping | no | no | no | Automate |
| T20 | Licensing Supervisor | Quality sampling | no | no | no | Assist: select sample |

**Expected shape of the result.** Four job profiles, twenty tasks. Tasks T15 to T18 carry the rights-affecting flag, and T17 the irreversible one. Tasks T01, T02, T03, T10, T12, T15 and T18 are client-facing, so a human must release them. The Verification Analyst and Fee and Payment Officer profiles hold the most tasks that can be automated, and the Supervisor profile holds the fewest.
