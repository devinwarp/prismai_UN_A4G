# SOP-APT-003: Patient appointment booking and service navigation

> **Fictitious document.** Wahat Health Services Authority, its clinics, fees, booking windows and staff titles are invented for demonstration. Nothing here describes a real authority, real law or clinical guidance.

| Field | Value |
|---|---|
| Document id | SOP-APT-003 |
| Version | 1.0 (synthetic) |
| Owner | Director of Patient Access, Wahat Health Services Authority |
| Related use case | UC05: Patient appointment and service navigation agent |
| Applies to | Booking, changing and cancelling outpatient appointments, and guiding patients to the right Wahat service |
| Review cycle | Every 12 months |

## 1. Purpose

Get every patient to the right clinic at the right time, with correct information about the appointment, its cost and what to bring. Patient access staff book and guide; they never give clinical advice. Only a clinician decides how urgent a need is, and every message to a patient is approved by a clinician or an officer before it is sent.

## 2. Scope

**In scope:** requests for outpatient appointments at Wahat primary care centres and specialist clinics; guidance to the right service; checks of referral, eligibility and fees; confirmation, change and cancellation of appointments; waitlists; no-shows.

**Out of scope:** emergencies (the patient is told to call the emergency number or go to an emergency department); clinical advice of any kind; prescriptions and results; inpatient admissions; complaints about care (handled by SOP-PX-010).

## 3. Roles

Four job profiles carry out this procedure. Each has a distinct purpose, a fixed set of tasks and its own limits.

### 3.1 Patient Access Officer
- **Purpose:** be the patient's point of contact, run the safety screen and book the appointment.
- **Works with:** patients and carers (app, portal, phone and counter), the Scheduling Coordinator, the Triage Nurse.
- **Authority:** may verify identity, run the fixed safety screen, book into a slot that matches the urgency set by a referral or the Triage Nurse, and release a templated confirmation. May not give clinical advice, set urgency, or overbook a clinic.
- **Skills:** patient communication in Arabic and English, the service directory, the booking system, the safety screen script.

### 3.2 Scheduling Coordinator
- **Purpose:** manage clinic capacity, the waitlist and changes made by a clinic.
- **Works with:** clinic managers, Patient Access Officers, the Patient Access Supervisor.
- **Authority:** may open and close slots as clinics instruct, run the waitlist, and rebook patients after a clinic cancellation. May not change a patient's urgency.
- **Skills:** clinic templates, waitlist rules, the booking system.

### 3.3 Triage Nurse (Clinician)
- **Purpose:** make every clinical judgement in this procedure.
- **Works with:** Patient Access Officers, patients by phone, clinic doctors.
- **Authority:** the only role that may set or change urgency, choose a clinic on clinical grounds, tell a patient anything clinical, and approve a message that contains clinical content.
- **Skills:** nurse triage, the urgency categories (section 6), clear explanation to patients.

### 3.4 Patient Access Supervisor (Approving Officer)
- **Purpose:** approve messages that are not templated, decide exceptions on fees and no-shows, and check quality.
- **Works with:** all roles above, Finance, the Director of Patient Access.
- **Authority:** the only role that may approve a non-templated patient message without clinical content, approve a fee exception request (sent on to Finance), and decide what follows repeated no-shows.
- **Skills:** booking and fee rules, judgement on exceptions, writing clear notices.

## 4. Procedure

Task ids are used in the audit log and the training material.

### Step 1. Contact and safety (Patient Access Officer)

| Task | Action |
|---|---|
| T01 | Receive the request from the app, portal, phone or counter. Tell the patient whether they are talking to an AI assistant or a person, and that they can ask for a person at any time. |
| T02 | Verify the patient's identity and health card (D1, D2). For a child or another adult, verify the guardian or carer (D5). |
| T03 | Ask the fixed safety-screen questions (section 6.2). Any "yes" stops the booking: give the emergency instruction or pass the patient to the Triage Nurse at once. |

### Step 2. Route (Patient Access Officer and Triage Nurse)

| Task | Action |
|---|---|
| T04 | Find the service the patient needs from the service directory, using only what the patient asks for (for example "a check-up", "my diabetes clinic", "a dentist"). |
| T05 | For a specialist clinic, check that a valid referral is on file (D3). The referral sets the urgency. |
| T06 | When the patient describes symptoms, is unsure which clinic they need, or asks for advice, pass them to the Triage Nurse. Do not interpret symptoms. |
| T07 | Triage Nurse: speak with the patient, set the urgency category (U1, U2 or U3) and the clinic, and record the reason. |

### Step 3. Book (Patient Access Officer)

| Task | Action |
|---|---|
| T08 | Check eligibility and the fee: health card status, insurance (D4), and the fee or co-payment from section 6.3. |
| T09 | Offer slots inside the booking window for the urgency category. If none is free, add the patient to the waitlist (T13) and tell them. |
| T10 | Book the slot the patient chooses and release the templated confirmation: date, time, clinic, what to bring, the fee, and how to change or cancel. |

### Step 4. Changes (Patient Access Officer, Scheduling Coordinator)

| Task | Action |
|---|---|
| T11 | Change or cancel an appointment at the patient's request and release the templated confirmation of the change. |
| T12 | When a clinic cancels a session, rebook every affected patient inside their urgency window. The Supervisor approves the notice to patients before it is sent. |
| T13 | Run the waitlist: offer freed slots in order of urgency, then date added. |

### Step 5. Close and assure

| Task | Action | Role |
|---|---|---|
| T14 | Record a no-show. After a second no-show within 6 months, send the case to the Supervisor. | Patient Access Officer |
| T15 | Decide what follows repeated no-shows. No patient loses access to care without the Supervisor's recorded decision. | Patient Access Supervisor |
| T16 | Write every action to the audit log and close the request. | Patient Access Officer |
| T17 | Each month, sample 5% of requests and check them against this SOP. Report any request that deviated. | Patient Access Supervisor |

## 5. Timings

| Item | Target |
|---|---|
| First reply to the patient | 1 working day (phone: answered within 60 seconds) |
| Triage Nurse call-back | U1 within 2 hours; other requests within 1 working day |
| Confirmation after booking | At once (templated) |
| Rebooking after a clinic cancellation | Within 1 working day, inside the urgency window |
| Waitlist offer | As soon as a slot frees |

## 6. Urgency, safety screen and fees (fictitious)

### 6.1 Urgency categories and booking windows

| Category | Set by | Booking window |
|---|---|---|
| U1 Urgent | Triage Nurse or referral | Within 24 hours |
| U2 Soon | Triage Nurse or referral | Within 7 days |
| U3 Routine | Triage Nurse, referral, or the patient's own request for a routine service | Within 28 days |

A patient who books a routine service directly (a check-up, a vaccination, a follow-up the clinic asked for) is U3 without triage.

### 6.2 Safety-screen questions

The Patient Access Officer reads these exactly and does not interpret the answers.
1. Is anyone in danger right now, or does the patient have chest pain, severe difficulty breathing, sudden weakness of the face or limbs, or heavy bleeding?
2. Is the patient thinking of harming themselves?
3. Is the patient a baby under 3 months with a fever?
4. Is the patient pregnant with bleeding or severe pain?

Any "yes" to question 1: tell the caller to call the emergency number or go to the nearest emergency department now. Any "yes" to questions 2 to 4: pass the patient to the Triage Nurse at once and stay with them until the nurse answers.

### 6.3 Fees

| Service | Patient with a valid Wahat health card | Insured patient | Self-paying patient |
|---|---|---|---|
| Primary care consultation | No charge | Co-payment 20 | 150 |
| Specialist consultation | No charge with referral | Co-payment 50 | 300 |
| Vaccination (national schedule) | No charge | No charge | No charge |

Amounts are in a synthetic currency unit. Fees are quoted to patients exactly as in this table.

## 7. Controls

1. Patient access staff never give clinical advice, interpret symptoms or set urgency. Only the Triage Nurse does.
2. The safety screen (section 6.2) is read in full before every booking that was not made by a referral.
3. Every patient is told whether they are talking to an AI assistant or a person.
4. Every message to a patient is either a templated message whose wording the Supervisor and a clinical lead have approved, or is approved before sending: by the Triage Nurse if it has clinical content, otherwise by the Supervisor.
5. A booking never goes outside the urgency window without the Triage Nurse's agreement.
6. Messages go only to the contact details on the patient record.
7. Health information is used only for this booking and the audit record, and shown only to staff who need it.
8. Every action is written to the audit log with who, what and when.
9. No service, clinic, slot or fee is stated unless it is in the service directory, the booking system or section 6.

## 8. Exceptions and escalation

| Situation | Handled by | Escalate to |
|---|---|---|
| "Yes" to safety question 1 | Patient Access Officer | Emergency instruction at once |
| "Yes" to safety questions 2 to 4 | Patient Access Officer | Triage Nurse at once |
| No slot inside the urgency window | Scheduling Coordinator | Triage Nurse, then clinic manager |
| Referral missing or expired | Patient Access Officer | Referring doctor, through the patient |
| Patient cannot pay the fee | Patient Access Officer | Supervisor, then Finance |
| Second no-show within 6 months | Patient Access Officer | Supervisor |
| Patient asks for clinical advice | Patient Access Officer | Triage Nurse |
| Identity or guardianship cannot be confirmed | Patient Access Officer | Supervisor |

## 9. Records

Booking record, safety-screen answers, triage notes, released messages and their approvals, waitlist, no-show record, Supervisor decisions and monthly sample report. Kept for 7 years; for a minor, until the age of 25 (synthetic retention periods).

## 10. Required documents and how to book

A booking needs D1 and D2. D3, D4 and D5 are needed only in the situations described. Patients may send documents in Arabic or English.

### D1. Wahat health card
- **What it is:** the card issued by Wahat that gives access to its services.
- **What must be true:** the card number matches the patient record and the card is valid on the appointment date.

### D2. Identity document
- **What it is:** the national ID card, or for a non-national the passport with the residence permit.
- **What must be true:** the name and date of birth match the patient record.

### D3. Referral (specialist clinics only)
- **What it is:** a referral from a Wahat primary care doctor or a licensed private doctor.
- **What must be true:** it names the patient, the specialty and the urgency, and is dated within the last 90 days.

### D4. Insurance card (insured patients)
- **What must be true:** it names the patient and is valid on the appointment date.

### D5. Guardian or carer proof
- **What it is:** for a child under 18, the guardian's identity and the child's birth certificate or family book; for an adult, a signed consent from the patient naming the carer.
- **What must be true:** the guardian or carer is named on the document.

### SUB. How to book
- **App or portal (preferred):** choose the service, answer the safety screen, choose a slot, and upload D3 or D4 if needed (PDF, JPG or PNG, up to 10 MB).
- **Phone:** the patient access line, Sunday to Thursday 7:00 to 21:00, Friday and Saturday 8:00 to 14:00.
- **Counter:** at any primary care centre.

### VAL. When a document on file is still valid
A document already on the patient record is not requested again if it has not expired and the details on it still match the record. A referral is used only for the specialty it names.

## 11. Detailed description of each task

Each entry gives the job profile, when the task starts, what goes in, the steps, what comes out, and where a problem goes.

### T01. Receive the request and disclose
- **Job profile:** Patient Access Officer.
- **Starts when:** a request arrives by app, portal, phone or counter.
- **Steps:** say whether the patient is talking to an AI assistant or a person and that they can ask for a person at any time; ask what the patient needs; open a request.
- **Output:** an open request.
- **Time target:** first reply within 1 working day; phone calls answered within 60 seconds.

### T02. Verify identity
- **Job profile:** Patient Access Officer.
- **Starts when:** a request is open.
- **Inputs:** D1, D2, and D5 if someone else is booking.
- **Steps:** match the health card and identity to the patient record; for a guardian or carer, check D5.
- **Output:** identity verified, or not verified with the reason.
- **Problems:** identity or guardianship that cannot be confirmed goes to the Supervisor. The safety screen (T03) still runs.

### T03. Run the safety screen
- **Job profile:** Patient Access Officer.
- **Starts when:** before any booking not made from a referral, and whenever the patient mentions a new symptom.
- **Steps:** read the four questions in section 6.2 exactly; record the answers; act on any "yes" as section 6.2 says.
- **Output:** a recorded screen, or an emergency instruction or hand-over to the Triage Nurse.
- **Problems:** never skip or shorten the screen, and never reassure the patient about a symptom.

### T04. Find the right service
- **Job profile:** Patient Access Officer.
- **Starts when:** the screen is clear.
- **Steps:** match what the patient asks for to the service directory; give the service, the centre and the booking route. A patient asking for a routine service is U3.
- **Output:** a named service.
- **Problems:** a request based on symptoms goes to T06.

### T05. Check the referral
- **Job profile:** Patient Access Officer.
- **Starts when:** the service is a specialist clinic.
- **Steps:** check D3 is on file, names the specialty, and is within 90 days; take the urgency from it.
- **Output:** a valid referral with its urgency, or a missing referral.
- **Problems:** missing or expired: tell the patient a referral is needed and how to get one; do not book.

### T06. Pass to the Triage Nurse
- **Job profile:** Patient Access Officer.
- **Starts when:** the patient describes symptoms, is unsure which clinic they need, or asks for advice.
- **Steps:** tell the patient a nurse will speak with them and when; pass the request with the patient's words and the screen answers.
- **Output:** a request waiting for triage.

### T07. Triage
- **Job profile:** Triage Nurse.
- **Starts when:** a request is passed to triage.
- **Steps:** speak with the patient; set the urgency category and the clinic; record the reason; give any clinical guidance yourself.
- **Output:** urgency and clinic recorded.
- **Time target:** U1 call-back within 2 hours; others within 1 working day.

### T08. Check eligibility and the fee
- **Job profile:** Patient Access Officer.
- **Starts when:** the service and urgency are known.
- **Steps:** check the health card or insurance (D1, D4); take the fee from section 6.3; tell the patient the amount.
- **Output:** the fee or "no charge", recorded.
- **Problems:** a patient who cannot pay is not refused booking at this step; the case goes to the Supervisor.

### T09. Offer slots
- **Job profile:** Patient Access Officer.
- **Starts when:** the fee step is done.
- **Steps:** offer up to three slots inside the window for the urgency (section 6.1).
- **Output:** a slot chosen, or a waitlist entry.
- **Problems:** no slot inside the window goes to the Scheduling Coordinator and the Triage Nurse (section 8).

### T10. Book and confirm
- **Job profile:** Patient Access Officer.
- **Starts when:** the patient chooses a slot.
- **Steps:** book it; release the templated confirmation with the date, time, clinic, what to bring, the fee, and how to change or cancel; send it to the contact on the record.
- **Output:** a booked appointment and a confirmation sent.

### T11. Change or cancel at the patient's request
- **Job profile:** Patient Access Officer.
- **Starts when:** the patient asks to change or cancel.
- **Steps:** verify identity; change or cancel; keep a new slot inside the urgency window; release the templated confirmation.
- **Output:** a changed or cancelled appointment, confirmed.

### T12. Rebook after a clinic cancellation
- **Job profile:** Scheduling Coordinator.
- **Starts when:** a clinic cancels a session.
- **Steps:** list affected patients by urgency; rebook each inside their window; draft the notice; get the Supervisor's approval; send it.
- **Output:** every affected patient rebooked and told.
- **Time target:** within 1 working day.

### T13. Run the waitlist
- **Job profile:** Scheduling Coordinator.
- **Starts when:** a slot frees.
- **Steps:** offer it to the waitlisted patient with the highest urgency, then the earliest date added; book on acceptance (T10).
- **Output:** a freed slot filled.

### T14. Record a no-show
- **Job profile:** Patient Access Officer.
- **Starts when:** a patient misses an appointment without cancelling.
- **Steps:** record it; for U1 or U2, tell the Triage Nurse the same day; after a second no-show within 6 months, send the case to the Supervisor.
- **Output:** a recorded no-show.

### T15. Decide on repeated no-shows
- **Job profile:** Patient Access Supervisor.
- **Starts when:** a case arrives from T14.
- **Steps:** review the history and any reasons; decide (for example, a reminder call before future bookings); record the reason. No patient loses access to care without this decision.
- **Output:** a recorded decision.

### T16. Close and audit
- **Job profile:** Patient Access Officer.
- **Starts when:** the appointment is attended, cancelled or recorded as a no-show.
- **Steps:** close the request; confirm every action has an audit log entry (control 8).
- **Output:** a closed request with a complete audit log.

### T17. Monthly quality sample
- **Job profile:** Patient Access Supervisor.
- **Starts when:** each month ends.
- **Steps:** sample 5% of requests; check the disclosure, the safety screen, urgency windows and messages against this SOP; report any request that deviated.
- **Output:** the monthly sample report.

## 12. Decision rules for a booking

### R1. Who decides what
Only the Triage Nurse makes clinical judgements and sets urgency. Only the Supervisor approves a non-templated message without clinical content, a fee exception, or the outcome of repeated no-shows.

### R2. Book when all of these are true
Identity is verified; the safety screen is clear or the Triage Nurse has cleared the patient; the urgency is set by a referral, the Triage Nurse, or a routine request; any referral needed is valid; the slot is inside the urgency window.

### R3. Do not book, and act at once, when
The safety screen has a "yes" (section 6.2).

### R4. Fees
The fee is taken from section 6.3. No one waives or reduces a fee except through the Supervisor's request to Finance. A patient is not refused a booking because of an unpaid fee at the booking step.

### R5. Messages
Templated messages are released by the Patient Access Officer. Any other message is approved by the Triage Nurse if it has clinical content, otherwise by the Supervisor.

### R6. Minors and carers
A child under 18 is booked by a verified guardian. An adult is booked by a carer only with the patient's signed consent (D5).

### R7. Statuses and what they mean
"Booked": a slot is confirmed. "Waitlisted": no slot inside the window yet. "Awaiting triage": waiting for the Triage Nurse. "Cancelled": cancelled by the patient or the clinic. "No-show": missed without cancelling.

## 13. Questions patients ask, and the answer under this SOP

### Q1. Am I talking to a person?
We tell you at the start. If it is our AI assistant, you can ask for a person at any time.

### Q2. I have a pain in my side. Which clinic should I see?
We cannot advise on symptoms. A Triage Nurse will call you back to decide the right clinic and how soon you need to be seen. If the pain is severe or sudden, call the emergency number now.

### Q3. Do I need a referral?
For specialist clinics, yes: from a Wahat primary care doctor or a licensed private doctor, dated within 90 days. Primary care, vaccinations and routine follow-ups need no referral.

### Q4. How much will it cost?
With a valid Wahat health card, no charge. Insured: a co-payment of 20 for primary care or 50 for a specialist. Self-paying: 150 for primary care or 300 for a specialist. Vaccinations on the national schedule are free.

### Q5. How soon can I be seen?
Urgent: within 24 hours. Soon: within 7 days. Routine: within 28 days. Urgency is set by your referral or a Triage Nurse.

### Q6. Can I book for my mother?
Yes, with her signed consent naming you, and her health card and identity details.

### Q7. What happens if I miss my appointment?
We record it. After two missed appointments in 6 months a supervisor reviews your bookings. You will not lose access to care without a supervisor's decision.

### Q8. How do I change my appointment?
In the app or portal, by phone, or at any centre. We keep the new date inside the time your care needs.

---

## Annex A. Reference breakdown (for testing an SOP analyzer)

This annex is not part of the SOP. It is the answer key a test would compare an analyzer's output against. Flags: **CF** client-facing (the output reaches a patient), **RA** rights-affecting (a decision about the patient's access to care), **IR** irreversible (cannot be undone through this procedure).

| Task | Job profile | Task type | CF | RA | IR | Suggested for automation |
|---|---|---|:-:|:-:|:-:|---|
| T01 | Patient Access Officer | Intake and disclosure | yes | no | no | Automate, fixed script |
| T02 | Patient Access Officer | Identity check | yes | no | no | Automate, exact match to record |
| T03 | Patient Access Officer | Safety screen | yes | no | no | Automate the fixed script; any "yes" to a person at once |
| T04 | Patient Access Officer | Service navigation | yes | no | no | Automate, service directory only |
| T05 | Patient Access Officer | Referral check | no | no | no | Automate |
| T06 | Patient Access Officer | Hand-off to clinician | yes | no | no | Automate the routing |
| T07 | Triage Nurse | Clinical triage | yes | yes | no | Human only |
| T08 | Patient Access Officer | Eligibility and fee lookup | yes | no | no | Automate, exact table lookup |
| T09 | Patient Access Officer | Slot offer | yes | no | no | Automate within the urgency window |
| T10 | Patient Access Officer | Booking and templated confirmation | yes | no | no | Automate, approved template |
| T11 | Patient Access Officer | Change or cancel | yes | no | no | Automate, approved template |
| T12 | Scheduling Coordinator | Rebooking and notice | yes | no | no | Assist, with human release |
| T13 | Scheduling Coordinator | Waitlist | yes | no | no | Automate the ordering |
| T14 | Patient Access Officer | No-show record | no | no | no | Automate |
| T15 | Patient Access Supervisor | No-show decision | yes | yes | no | Human only |
| T16 | Patient Access Officer | Record keeping | no | no | no | Automate |
| T17 | Patient Access Supervisor | Quality sampling | no | no | no | Assist: select sample |

**Expected shape of the result.** Four job profiles, seventeen tasks. T07 and T15 carry the rights-affecting flag and are human only; no task is irreversible. The Patient Access Officer holds most of the tasks that can be automated, but only within fixed scripts, the service directory, the fee table and approved templates. Clinical content always goes to the Triage Nurse.
