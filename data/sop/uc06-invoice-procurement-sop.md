# SOP-FIN-009: Purchase orders, invoice processing and supplier payment

> **Fictitious document.** Wahat Health Services Authority, its thresholds, approval limits, systems and staff titles are invented for demonstration. Nothing here describes a real authority, real law or real financial regulation.

| Field | Value |
|---|---|
| Document id | SOP-FIN-009 |
| Version | 1.0 (synthetic) |
| Owner | Director of Finance and Procurement, Wahat Health Services Authority |
| Related use case | UC06: Invoice processing and procurement automation |
| Applies to | Purchases of goods and services up to 100,000 per order, from requisition to purchase order, invoice matching, budget checks and supplier payment, including changes to supplier bank details |
| Review cycle | Every 12 months |

## 1. Purpose

Buy what Wahat needs at the right price, pay suppliers correctly and on time, and never pay the wrong party, twice, or outside budget. Clerks and analysts prepare, match and flag; named officers approve within their limits. Nothing irreversible (issuing a purchase order, approving a payment run, releasing a payment, changing supplier bank details) happens without a named person's approval.

## 2. Scope

**In scope:** purchase requisitions; quotations; purchase orders up to 100,000; receiving records; supplier invoices; three-way matching; budget checks and spending anomalies; payment runs; changes to supplier bank details.

**Out of scope:** tenders above 100,000 (SOP-PRC-004); emergency clinical purchases (SOP-PRC-011); payroll; staff expense claims (SOP-FIN-012); supplier onboarding and due diligence (SOP-PRC-006).

## 3. Roles

Four job profiles carry out this procedure. Each has a distinct purpose, a fixed set of tasks and its own limits.

### 3.1 Procurement Operations Analyst
- **Purpose:** turn an approved need into the best-value purchase order.
- **Works with:** requesting departments, suppliers, the Budget Analyst, the Finance Approving Officer.
- **Authority:** may request quotations, compare them and propose a supplier and a draft purchase order. May not approve or issue a purchase order.
- **Skills:** the quotation thresholds (section 6.1), supplier catalogues, price comparison.

### 3.2 Accounts Payable Clerk
- **Purpose:** record supplier invoices accurately and prepare correct payments.
- **Works with:** suppliers, receiving staff, the Procurement Operations Analyst, the Finance Approving Officer.
- **Authority:** may capture invoices, run the duplicate and match checks, put an invoice on hold, prepare a payment run, and verify a bank detail change by call-back. May not approve a payment, release a payment or change the supplier master.
- **Skills:** the Wahat Finance System, matching tolerances (section 6.2), attention to detail.

### 3.3 Budget Analyst
- **Purpose:** make sure every commitment has budget and flag unusual spending.
- **Works with:** budget holders, the Procurement Operations Analyst, the Finance Approving Officer.
- **Authority:** may confirm or refuse budget availability and raise an anomaly. May not move budget between lines.
- **Skills:** the budget structure, cost-centre coding, the anomaly rules (section 6.3).

### 3.4 Finance Approving Officer
- **Purpose:** approve purchase orders, payment runs and supplier bank changes within the approval limits.
- **Works with:** all three roles above, the Director of Finance and Procurement.
- **Authority:** the only role that may approve or issue a purchase order (within limits), approve a payment run, release a payment, approve a bank detail change and approve an exception. An order above their limit goes to the Director.
- **Skills:** the approval limits, financial controls, judgement on exceptions.

## 4. Procedure

Task ids are used in the audit log and the training material.

### Step 1. Requisition and purchase order

| Task | Action | Role |
|---|---|---|
| T01 | Receive a requisition approved by the budget holder; confirm budget is available on the cost centre. | Budget Analyst |
| T02 | Get the number of quotations the threshold requires and compare them on total cost and delivery. | Procurement Operations Analyst |
| T03 | Propose the supplier and prepare a draft purchase order with the comparison attached. | Procurement Operations Analyst |
| T04 | Approve and issue the purchase order within the approval limits, or send it to the Director. | Finance Approving Officer |

### Step 2. Invoice (Accounts Payable Clerk)

| Task | Action |
|---|---|
| T05 | Receive the invoice, capture it in the Wahat Finance System and link it to the purchase order. |
| T06 | Check the supplier is active and the invoice is not a duplicate (same supplier, number and amount, or same supplier, amount and date). |
| T07 | Three-way match the invoice against the purchase order and the receiving record within the tolerances. |
| T08 | Put any invoice that fails T06 or T07 on hold and send it to the Procurement Operations Analyst or receiving department with the reason. |

### Step 3. Budget and anomalies (Budget Analyst)

| Task | Action |
|---|---|
| T09 | Check each matched invoice against the commitment and the anomaly rules. |
| T10 | Investigate each anomaly with the budget holder and record the explanation, or refer it to the Finance Approving Officer. |

### Step 4. Payment

| Task | Action | Role |
|---|---|---|
| T11 | Prepare the weekly payment run from matched, cleared invoices due within the next 7 days. | Accounts Payable Clerk |
| T12 | Review and approve the payment run. | Finance Approving Officer |
| T13 | Release the approved payment run to the bank. | Finance Approving Officer |

### Step 5. Supplier bank detail changes

| Task | Action | Role |
|---|---|---|
| T14 | Verify a bank detail change request by calling the supplier on the phone number already on the supplier master. | Accounts Payable Clerk |
| T15 | Approve the change and have it applied by a second person in the supplier master. | Finance Approving Officer |

### Step 6. Close and assure

| Task | Action | Role |
|---|---|---|
| T16 | At month end reconcile the supplier ledger to the bank and to open purchase orders. | Accounts Payable Clerk |
| T17 | Each month, sample 5% of paid invoices and all exceptions and check them against this SOP. | Finance Approving Officer |

## 5. Timings

| Item | Target |
|---|---|
| Budget check | 1 working day from requisition |
| Purchase order issued | 5 working days (one quote), 10 working days (three quotes) |
| Invoice captured | 2 working days from receipt |
| Matching and budget check | 3 working days from capture |
| Supplier paid | Within 30 days of a valid invoice |
| Bank change verified | Before the next payment run, never in the same day as the request |

## 6. Thresholds, tolerances, limits and anomaly rules (fictitious)

### 6.1 Quotations

| Order value | Quotations required |
|---|---|
| Up to 10,000 | 1 (catalogue price or one written quote) |
| 10,001 to 100,000 | 3 written quotes |
| Above 100,000 | Tender, SOP-PRC-004 |

An order is not split to stay under a threshold.

### 6.2 Three-way match tolerances

| Item | Tolerance |
|---|---|
| Quantity | Exact match to received quantity |
| Unit price | Up to 2% or 500 per invoice above the order, whichever is lower |
| Total | No more than the order total plus the price tolerance |

### 6.3 Budget anomaly rules
1. A cost centre's spend in a month above 110% of its monthly budget profile.
2. An invoice coded to a cost centre different from its purchase order.
3. A supplier paid more than 3 times in one month without 3 purchase orders.
4. An invoice dated before its purchase order.

### 6.4 Approval limits

| Approver | Purchase order | Payment run |
|---|---|---|
| Finance Approving Officer | Up to 50,000 | Up to 2,000,000 per run |
| Director of Finance and Procurement | Up to 100,000 | Any run |

Amounts are in a synthetic currency unit.

## 7. Controls

1. No purchase order without a confirmed budget and the required quotations.
2. No payment without a purchase order, a receiving record and a three-way match within tolerance.
3. The person who prepares a payment run does not approve or release it.
4. A supplier bank detail change is verified by a call to the number already on file, never to a number given in the request, and is applied by a second person.
5. No payment is released in the same working day as a bank detail change for that supplier.
6. Duplicate checks run on every invoice before matching.
7. Every action is written to the audit log with who, what and when.

## 8. Exceptions and escalation

| Situation | Handled by | Escalate to |
|---|---|---|
| Order above the officer's limit | Finance Approving Officer | Director |
| Match outside tolerance | Accounts Payable Clerk | Procurement Operations Analyst; Finance Approving Officer to accept |
| Suspected duplicate | Accounts Payable Clerk | Finance Approving Officer |
| Bank change cannot be verified | Accounts Payable Clerk | Finance Approving Officer and Internal Audit |
| Suspected fraud or split order | Any role | Internal Audit, immediately |
| No budget available | Budget Analyst | Budget holder and Director |

## 9. Records

Requisitions, quotations and comparisons, purchase orders, receiving records, invoices, match results, anomaly log, payment runs and approvals, bank change verifications, reconciliations and monthly sample. Kept for 10 years (synthetic retention period).

## 10. Required documents and how to submit

### D1. Approved requisition
- **What must be true:** approved by the budget holder; states item, quantity, cost centre and need-by date.

### D2. Quotations
- **What must be true:** written, from active suppliers, for the same specification, dated within 30 days.

### D3. Purchase order
- **What must be true:** issued by the Finance Approving Officer or the Director within limits.

### D4. Receiving record
- **What must be true:** entered by the receiving department, with quantity and date received.

### D5. Supplier invoice
- **What must be true:** shows the supplier's legal name, the purchase order number, invoice number and date, quantities, unit prices and total.

### D6. Bank detail change request
- **What must be true:** on the supplier's letterhead, signed by an authorised signatory on file, with a bank letter confirming the new account.

### SUB. How suppliers submit invoices
By the supplier portal or the accounts payable mailbox, one invoice per file, with the purchase order number. Paper invoices are scanned on receipt. Bank changes are accepted only as D6 and are never applied from an email alone.

### VAL. When a document stays valid
A quotation is valid for 30 days. A purchase order stays open until fully invoiced or closed. A receiving record is valid for its delivery only.

## 11. Detailed description of each task

### T01. Confirm budget for a requisition
- **Job profile:** Budget Analyst.
- **Inputs:** D1, the budget for the cost centre.
- **Steps:** check the requisition is approved by the budget holder; check the remaining budget covers the estimated value; record the commitment check.
- **Output:** budget confirmed, or refused with the reason.

### T02. Get and compare quotations
- **Job profile:** Procurement Operations Analyst.
- **Steps:** read the threshold (section 6.1); request the required quotes from active suppliers; compare total cost including delivery, and delivery date; check the order has not been split.
- **Output:** a comparison sheet.

### T03. Propose the supplier and draft the order
- **Job profile:** Procurement Operations Analyst.
- **Steps:** propose the lowest total cost that meets the specification and need-by date; give the reason if another is proposed; draft the order.
- **Output:** a draft purchase order with the comparison.

### T04. Approve and issue the purchase order
- **Job profile:** Finance Approving Officer.
- **Steps:** check budget, quotations and the proposal; approve within limits (section 6.4) and issue, or send to the Director. An issued order commits Wahat to the supplier; cancelling it is a separate procedure.
- **Output:** an issued purchase order.

### T05. Capture the invoice
- **Job profile:** Accounts Payable Clerk.
- **Steps:** enter the invoice fields from D5; link it to the purchase order; if there is no order number, put it on hold and ask the supplier.
- **Output:** a captured invoice.

### T06. Supplier and duplicate checks
- **Job profile:** Accounts Payable Clerk.
- **Steps:** confirm the supplier is active; search for the same supplier with the same invoice number, or the same amount and date.
- **Output:** checks passed, or the invoice on hold as a suspected duplicate.

### T07. Three-way match
- **Job profile:** Accounts Payable Clerk.
- **Steps:** compare quantity with the receiving record, unit price and total with the order, using section 6.2.
- **Output:** "matched", or "outside tolerance" with the differences.
- **Example:** order 10 units at 1,000; received 10; invoice 10 at 1,015 is 1.5% and 150 above, within tolerance.

### T08. Hold and route exceptions
- **Job profile:** Accounts Payable Clerk.
- **Steps:** hold the invoice; send it with the reason to the Analyst (price) or receiving department (quantity).
- **Output:** a held invoice with an owner. Only the Finance Approving Officer may accept a variance outside tolerance.

### T09. Budget and anomaly check
- **Job profile:** Budget Analyst.
- **Steps:** confirm the invoice consumes its commitment; test the anomaly rules in section 6.3.
- **Output:** "cleared", or an anomaly raised.

### T10. Investigate an anomaly
- **Job profile:** Budget Analyst.
- **Steps:** ask the budget holder for an explanation; record it; clear the anomaly or refer it to the Finance Approving Officer.
- **Output:** a recorded explanation or a referral.

### T11. Prepare the payment run
- **Job profile:** Accounts Payable Clerk.
- **Steps:** select cleared, matched invoices due within 7 days; exclude any supplier with a bank change in the last working day; produce the run with totals by supplier.
- **Output:** a draft payment run.

### T12. Approve the payment run
- **Job profile:** Finance Approving Officer.
- **Steps:** check each line has a match and clearance; check the total against limits; remove any line in doubt; approve.
- **Output:** an approved run.

### T13. Release the payment
- **Job profile:** Finance Approving Officer.
- **Steps:** release the approved run to the bank exactly as approved. A released payment cannot be recalled through this procedure.
- **Output:** the bank's confirmation filed with the run.

### T14. Verify a bank detail change
- **Job profile:** Accounts Payable Clerk.
- **Starts when:** a D6 arrives.
- **Steps:** call the supplier on the number already on the supplier master; confirm the request with a named contact; record the call.
- **Output:** verified, or not verified (section 8).

### T15. Approve and apply the change
- **Job profile:** Finance Approving Officer.
- **Steps:** review the verification; approve; a second person, not the Clerk who verified, applies it in the supplier master.
- **Output:** an approved, applied change.

### T16. Month-end reconciliation
- **Job profile:** Accounts Payable Clerk.
- **Steps:** reconcile the supplier ledger to the bank statement and open orders; list differences.
- **Output:** the reconciliation with differences explained or escalated.

### T17. Monthly sample
- **Job profile:** Finance Approving Officer.
- **Steps:** sample 5% of paid invoices and every exception; check each against this SOP; report deviations to the Director.
- **Output:** the monthly sample report.

## 12. Decision rules

### R1. Who decides
Only the Finance Approving Officer (within limits) or the Director approves a purchase order, a payment run, a payment release, a bank detail change or an exception.

### R2. Pay an invoice when all of these are true
The supplier is active; the invoice is not a duplicate; it matches within tolerance; the Budget Analyst has cleared it; it is in an approved run.

### R3. Hold an invoice when
Any condition in R2 fails. A held invoice is not paid until its owner resolves it.

### R4. Quotations
The number required follows section 6.1. An order is never split to avoid a threshold.

### R5. Bank changes
Verified by call-back to the number on file, approved by the Finance Approving Officer, applied by a second person, and never in the same working day as a payment to that supplier.

### R6. Irreversible actions
An issued purchase order and a released payment cannot be undone in this procedure.

### R7. Statuses and what they mean
"Captured", "On hold" (a check failed), "Matched", "Cleared" (budget check passed), "In run", "Paid".

## 13. Questions suppliers and staff ask, and the answer under this SOP

### Q1. Why hasn't my invoice been paid?
It is on hold because a check failed; the hold reason is sent to the supplier contact on file.

### Q2. Can I send my invoice without a purchase order number?
No. It will be held until you give the order number.

### Q3. How do I change our bank account?
Send a signed letter with a bank confirmation (D6). Wahat will call you on the number already on file before anything changes.

### Q4. When will I be paid?
Within 30 days of a valid, matched invoice, in the weekly payment run.

### Q5. Can we split this order to avoid three quotes?
No (rule R4).

---

## Annex A. Reference breakdown (for testing an SOP analyzer)

This annex is not part of the SOP. It is the answer key a test would compare an analyzer's output against. Flags: **CF** client-facing (the output reaches a supplier or citizen), **RA** rights-affecting (a decision about someone's legal standing), **IR** irreversible (cannot be undone through this procedure).

| Task | Job profile | Task type | CF | RA | IR | Suggested for automation |
|---|---|---|:-:|:-:|:-:|---|
| T01 | Budget Analyst | Budget check | no | no | no | Automate |
| T02 | Procurement Operations Analyst | Quotation comparison | yes | no | no | Assist: compare quotes |
| T03 | Procurement Operations Analyst | Supplier proposal | no | no | no | Assist: draft order |
| T04 | Finance Approving Officer | Order approval and issue | yes | no | yes | Human only |
| T05 | Accounts Payable Clerk | Invoice capture | no | no | no | Automate |
| T06 | Accounts Payable Clerk | Duplicate and supplier check | no | no | no | Automate |
| T07 | Accounts Payable Clerk | Three-way match | no | no | no | Automate, exact tolerances |
| T08 | Accounts Payable Clerk | Hold and route | no | no | no | Automate |
| T09 | Budget Analyst | Anomaly detection | no | no | no | Automate, fixed rules |
| T10 | Budget Analyst | Anomaly investigation | no | no | no | Assist: summarise evidence |
| T11 | Accounts Payable Clerk | Payment run preparation | no | no | no | Automate |
| T12 | Finance Approving Officer | Payment run approval | no | no | yes | Human only |
| T13 | Finance Approving Officer | Payment release | yes | no | yes | Human only |
| T14 | Accounts Payable Clerk | Bank change verification | yes | no | no | Human only (call-back) |
| T15 | Finance Approving Officer | Bank change approval | no | no | yes | Human only |
| T16 | Accounts Payable Clerk | Reconciliation | no | no | no | Automate |
| T17 | Finance Approving Officer | Quality sampling | no | no | no | Assist: select sample |

**Expected shape of the result.** Four job profiles, seventeen tasks. T04, T12, T13 and T15 are irreversible and human only. No task is rights-affecting. Automation sits in capture, duplicate checks, matching, anomaly rules and run preparation; the bank change call-back stays human because it is the fraud control.
