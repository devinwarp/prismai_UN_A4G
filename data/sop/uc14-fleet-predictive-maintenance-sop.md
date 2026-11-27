# SOP-FLT-005: Fleet condition monitoring and predictive maintenance

> **Fictitious document.** Qanat Transport and Mobility Agency, its fleet, thresholds, systems and staff titles are invented for demonstration. Nothing here describes a real authority, real law or real engineering standards.

| Field | Value |
|---|---|
| Document id | SOP-FLT-005 |
| Version | 1.0 (synthetic) |
| Owner | Head of Fleet Operations, Qanat Transport and Mobility Agency |
| Related use case | UC14: Fleet and asset predictive maintenance |
| Applies to | Qanat's buses and service vehicles fitted with telemetry: monitoring condition data, acting on alerts and failure predictions, planning and carrying out maintenance, returning vehicles to service, and recommending end-of-life disposal |
| Review cycle | Every 12 months |

## 1. Purpose

Keep every vehicle safe and available by finding faults before they cause a breakdown, and spend maintenance money where it prevents the most failures. Telemetry and prediction models suggest; qualified people inspect, repair and decide. A vehicle with a safety-critical alert is taken out of service at once. Nothing irreversible (disposal of a vehicle) and no change to alert thresholds or the prediction model happens without the Fleet Operations Manager's recorded approval.

## 2. Scope

**In scope:** daily telemetry checks; alert classification; failure predictions; work orders; parts within the planner's limit; workshop scheduling; inspection, repair and return to service; lifecycle reviews and disposal recommendations; monitoring the accuracy of alerts and predictions.

**Out of scope:** accident investigation (SOP-SAF-003); warranty claims (SOP-FLT-009); parts purchases above 20,000 (SOP-QPR-002); vehicle purchases; driver behaviour (SOP-OPS-011).

## 3. Roles

Four job profiles carry out this procedure. Each has a distinct purpose, a fixed set of tasks and its own limits.

### 3.1 Fleet Data Analyst
- **Purpose:** turn telemetry into correct, timely alerts and risk rankings.
- **Works with:** the Fleet Maintenance Planner, the Workshop Supervisor, the Fleet Operations Manager.
- **Authority:** may run data checks, classify alerts by the table, produce risk rankings and lifecycle cases, and notify a Critical alert. May not change thresholds or the model, withdraw a vehicle or create a work order.
- **Skills:** telemetry data, the alert table (section 6.1), the prediction model's outputs and limits.

### 3.2 Fleet Maintenance Planner
- **Purpose:** turn alerts and predictions into scheduled work while keeping enough vehicles in service.
- **Works with:** the Analyst, the Workshop Supervisor, depot controllers, stores.
- **Authority:** may create work orders, book workshop slots, and order parts up to 20,000 per order. May not release a vehicle to service.
- **Skills:** maintenance planning, the availability rule (section 6.3), the Fleet Maintenance System.

### 3.3 Workshop Supervisor
- **Purpose:** make sure the right work is done to standard and that only safe vehicles go back into service.
- **Works with:** technicians, the Planner, depot controllers.
- **Authority:** may withdraw a vehicle from service, confirm or reject an alert on inspection, direct repairs, and release a vehicle to service after the required checks.
- **Skills:** heavy-vehicle engineering, inspection standards, safety sign-off.

### 3.4 Fleet Operations Manager (Approving Officer)
- **Purpose:** approve the decisions that cannot be undone or that change how the system judges vehicles.
- **Works with:** all three roles above, the Head of Fleet Operations.
- **Authority:** the only role that may approve parts orders above 20,000 (within SOP-QPR-002), a disposal recommendation, and any change to alert thresholds or the prediction model version.
- **Skills:** fleet asset management, cost-benefit judgement, safety assurance.

## 4. Procedure

Task ids are used in the audit log and the training material.

### Step 1. Monitor (Fleet Data Analyst)

| Task | Action |
|---|---|
| T01 | Each morning, check telemetry completeness for every vehicle. A vehicle with no data for more than 24 hours is flagged "unknown condition". |
| T02 | Classify every new alert by the alert table: Critical, High or Medium. |
| T03 | Rank vehicles by predicted failure probability in the next 14 days and list those above 0.6. |
| T04 | Notify each Critical alert to the Workshop Supervisor and the depot controller at once. |

### Step 2. Plan (Fleet Maintenance Planner)

| Task | Action |
|---|---|
| T05 | Create a work order for every High and Medium alert, every vehicle above 0.6, and every "unknown condition" vehicle, within the response window. |
| T06 | Check parts stock; order parts up to 20,000, or send larger orders to the Fleet Operations Manager. |
| T07 | Book workshop slots, combining work with scheduled services where the window allows, and keeping the availability rule. |

### Step 3. Inspect, repair and release (Workshop Supervisor)

| Task | Action |
|---|---|
| T08 | Withdraw from service any vehicle with a Critical alert, until inspected. |
| T09 | Inspect the vehicle and confirm or reject each alert or prediction, recording what was found. |
| T10 | Direct and check the repair. |
| T11 | Release the vehicle to service after the post-repair checks; a safety-critical repair needs a second qualified signature. |

### Step 4. Lifecycle

| Task | Action | Role |
|---|---|---|
| T12 | Prepare a lifecycle case for any vehicle that meets a lifecycle trigger. | Fleet Data Analyst |
| T13 | Approve or refuse a disposal recommendation. | Fleet Operations Manager |

### Step 5. Assure

| Task | Action | Role |
|---|---|---|
| T14 | Each month, measure how many alerts and predictions were confirmed on inspection, and how many breakdowns had no warning. | Fleet Data Analyst |
| T15 | Review the accuracy report and approve or refuse any proposed change to thresholds or the model. | Fleet Operations Manager |

## 5. Timings

| Item | Target |
|---|---|
| Critical alert notified | Within 15 minutes |
| Critical vehicle withdrawn | Before its next trip |
| High alert inspected | Within 24 hours |
| Medium alert inspected | Within 7 days |
| Prediction above 0.6 inspected | Within 7 days |
| "Unknown condition" vehicle inspected | Within 48 hours |
| Disposal decision | Within 20 working days of the case |

## 6. Alert table, triggers and availability rule (fictitious)

### 6.1 Alert table

| Signal | Threshold | Class | Response |
|---|---|---|---|
| Brake pad thickness | Below 3 mm | Critical | Withdraw and inspect |
| Brake air pressure fault | Any active fault code | Critical | Withdraw and inspect |
| Tyre tread | Below 3 mm | High | Inspect within 24 hours |
| Engine coolant temperature | Above 105 °C on 3 trips in 7 days | High | Inspect within 24 hours |
| Battery state of health (electric) | Below 70% | Medium | Inspect within 7 days |
| Door cycle fault | 5 or more faults in 7 days | Medium | Inspect within 7 days |
| Predicted failure (any component) | Probability above 0.6 in 14 days | Medium | Inspect within 7 days |

### 6.2 Lifecycle triggers
A vehicle older than 12 years; or repair costs in the last 12 months above 50% of replacement value; or more than 6 breakdowns in service in 12 months.

### 6.3 Availability rule
At least 90% of each depot's peak-hour fleet must be available. Work that would breach this is moved to off-peak or night slots, except a Critical alert, which always takes priority.

Amounts are in a synthetic currency unit.

## 7. Controls

1. A Critical alert always leads to withdrawal before the next trip; no schedule or availability target overrides it.
2. Only the Workshop Supervisor releases a vehicle to service; a safety-critical repair has two qualified signatures.
3. A prediction is a reason to inspect, never a reason to skip an inspection or a scheduled service.
4. Missing data is treated as unknown condition, not as healthy.
5. Only the Fleet Operations Manager approves a disposal or a change to thresholds or the model.
6. Every alert, work order, inspection result and release is written to the audit log with who, what and when.

## 8. Exceptions and escalation

| Situation | Handled by | Escalate to |
|---|---|---|
| Critical alert on a vehicle in service | Workshop Supervisor | Depot controller to replace the vehicle on the route |
| Availability would fall below 90% | Planner | Fleet Operations Manager |
| Parts order above 20,000 | Planner | Fleet Operations Manager; SOP-QPR-002 |
| Breakdown with no prior alert | Analyst | Fleet Operations Manager (accuracy review) |
| Repeated false alerts on one signal | Analyst | Fleet Operations Manager (threshold review) |
| Fault involved in an accident | Workshop Supervisor | SOP-SAF-003 |

## 9. Records

Telemetry check results, alerts and classifications, risk rankings, work orders, inspection findings, repair records, release sign-offs, lifecycle cases and decisions, monthly accuracy reports, threshold and model change approvals. Kept for the life of the vehicle plus 5 years (synthetic retention period).

## 10. Required documents and records

### D1. Telemetry record
- **What must be true:** time-stamped, from the vehicle's registered telematics unit.

### D2. Work order
- **What must be true:** names the vehicle, the alert or prediction, the response window and the work planned.

### D3. Inspection report
- **What must be true:** completed by a qualified technician; confirms or rejects each alert with findings.

### D4. Release sign-off
- **What must be true:** signed by the Workshop Supervisor; for a safety-critical repair (brakes, steering, tyres, doors) also by a second qualified technician.

### D5. Lifecycle case
- **What must be true:** age, mileage, repair costs, breakdowns, replacement value and a recommendation.

### SUB. How records are submitted
All records are entered in the Fleet Maintenance System; paper sign-offs are scanned the same day.

### VAL. When a record stays valid
An inspection report covers the alert it addresses. A new alert on the same signal after release needs a new inspection.

## 11. Detailed description of each task

### T01. Daily telemetry check
- **Job profile:** Fleet Data Analyst.
- **Output:** a completeness list; vehicles silent for more than 24 hours flagged "unknown condition".

### T02. Classify alerts
- **Job profile:** Fleet Data Analyst.
- **Steps:** apply section 6.1 exactly; a signal that matches two rows takes the higher class.
- **Output:** classified alerts.

### T03. Rank by predicted failure
- **Job profile:** Fleet Data Analyst.
- **Steps:** run the approved model version; list vehicles above 0.6 with the component and probability.
- **Output:** the risk ranking.
- **Problems:** a model version other than the approved one is not used.

### T04. Notify a Critical alert
- **Job profile:** Fleet Data Analyst.
- **Output:** notification to the Workshop Supervisor and depot controller within 15 minutes, logged.

### T05. Create work orders
- **Job profile:** Fleet Maintenance Planner.
- **Output:** D2 for each alert, prediction and unknown-condition vehicle.

### T06. Parts
- **Job profile:** Fleet Maintenance Planner.
- **Output:** parts reserved or ordered; larger orders sent for approval.

### T07. Book workshop slots
- **Job profile:** Fleet Maintenance Planner.
- **Steps:** book within the response window; keep the availability rule; combine with scheduled services where possible.
- **Output:** a workshop schedule.

### T08. Withdraw a vehicle
- **Job profile:** Workshop Supervisor.
- **Output:** the vehicle marked "out of service" in the system and the depot controller informed.

### T09. Inspect
- **Job profile:** Workshop Supervisor.
- **Output:** D3 with each alert confirmed or rejected. Rejected alerts are counted in T14.

### T10. Repair
- **Job profile:** Workshop Supervisor.
- **Output:** a completed repair record.

### T11. Release to service
- **Job profile:** Workshop Supervisor.
- **Steps:** carry out post-repair checks; obtain the second signature for a safety-critical repair; mark the vehicle "in service".
- **Output:** D4.

### T12. Lifecycle case
- **Job profile:** Fleet Data Analyst.
- **Output:** D5 for each vehicle meeting a trigger in section 6.2.

### T13. Approve disposal
- **Job profile:** Fleet Operations Manager.
- **Steps:** review D5; approve or refuse with reasons. A disposed vehicle cannot be returned through this procedure.
- **Output:** a recorded decision.

### T14. Accuracy report
- **Job profile:** Fleet Data Analyst.
- **Steps:** count alerts and predictions confirmed and rejected by signal; list in-service breakdowns with no warning.
- **Output:** the monthly accuracy report, with any proposed threshold or model change.

### T15. Approve threshold or model changes
- **Job profile:** Fleet Operations Manager.
- **Output:** each proposed change approved or refused, with reasons; approved changes take effect on a set date.

## 12. Decision rules

### R1. Who decides
The Workshop Supervisor decides withdrawal, inspection results and release. The Fleet Operations Manager decides disposal and changes to how alerts are generated. Data and models decide nothing.

### R2. Critical means withdraw
A Critical alert means the vehicle does not run again until inspected.

### R3. Unknown is not healthy
Missing telemetry leads to inspection within 48 hours.

### R4. Predictions add, never remove
A prediction can bring an inspection forward; it never cancels a scheduled service or inspection.

### R5. Release
Only after D4 is complete.

### R6. Disposal is irreversible
Only on the Manager's recorded approval.

### R7. Statuses
"In service", "Out of service", "In workshop", "Unknown condition", "Disposal approved".

## 13. Questions staff ask, and the answer under this SOP

### Q1. The model says the bus is fine but it is due a brake service. Can we skip it?
No (R4).

### Q2. A bus has a brake alert but we are short of vehicles at peak. Can it run one more trip?
No. Critical alerts take priority over availability (R2, section 6.3).

### Q3. The telematics unit has been offline for two days. Is the bus all right?
Unknown; it must be inspected within 48 hours (R3).

### Q4. We keep getting false door alerts. Can I raise the threshold?
Propose it in the monthly report; only the Fleet Operations Manager can approve it.

---

## Annex A. Reference breakdown (for testing an SOP analyzer)

This annex is not part of the SOP. It is the answer key a test would compare an analyzer's output against. Flags: **CF** client-facing (the output reaches a citizen), **RA** rights-affecting (a decision about someone's legal standing), **IR** irreversible (cannot be undone through this procedure).

| Task | Job profile | Task type | CF | RA | IR | Suggested for automation |
|---|---|---|:-:|:-:|:-:|---|
| T01 | Fleet Data Analyst | Data quality check | no | no | no | Automate |
| T02 | Fleet Data Analyst | Classification from a table | no | no | no | Automate, exact thresholds |
| T03 | Fleet Data Analyst | Failure prediction | no | no | no | Automate, approved model only |
| T04 | Fleet Data Analyst | Critical notification | no | no | no | Automate |
| T05 | Fleet Maintenance Planner | Work order creation | no | no | no | Automate |
| T06 | Fleet Maintenance Planner | Parts ordering | no | no | no | Automate within limit |
| T07 | Fleet Maintenance Planner | Scheduling | no | no | no | Assist: propose schedule |
| T08 | Workshop Supervisor | Withdrawal | no | no | no | Human only (system flag automated) |
| T09 | Workshop Supervisor | Inspection | no | no | no | Human only |
| T10 | Workshop Supervisor | Repair | no | no | no | Human only |
| T11 | Workshop Supervisor | Release to service | no | no | no | Human only |
| T12 | Fleet Data Analyst | Lifecycle case | no | no | no | Automate |
| T13 | Fleet Operations Manager | Disposal approval | no | no | yes | Human only |
| T14 | Fleet Data Analyst | Accuracy report | no | no | no | Automate |
| T15 | Fleet Operations Manager | Threshold and model change approval | no | no | no | Human only |

**Expected shape of the result.** Four job profiles, fifteen tasks. Only T13 (disposal) is irreversible. Nothing is client-facing or rights-affecting, but safety rests on R2 to R4 and on human release (T11). Automation sits in data checks, classification, prediction, work orders and reporting; inspection, release and approvals stay human.
