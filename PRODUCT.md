# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences with different roles, both working in the admin UI:

- **Federal AI governance officers.** They oversee AI use cases across government entities and countries: they set the policy target, import use cases, read the federal dashboard (deployed % beside compliant %), review verdicts and traces, and decide releases.
- **Entity-level process owners.** They work for one entity (a ministry or company): they submit SOPs and use cases, set that entity's human-in-the-loop rules, and follow their own entity's results. They see their own entity, not the whole federation.

Role boundaries follow the product's role rules (see `supabase/un-roles.sql` and `docs/un-shared-edits.md`; that SQL is written but not yet applied).

## Product Purpose

Prism governs the path from an AI use case to a deployed, attested agent in government. It configures a policy target, imports use cases, has role agents examine each one against a knowledge base, lets a deterministic policy engine decide, and records every step in a hash-chained trace log. Built as an entry for the AI for Good Lab Hackathon: United Arab Emirates (ITU). Success is a reviewer, officer or judge being able to see what is live, what is compliant, and why each verdict was reached.

## Positioning

Three claims together, none of which a neighbouring AI-governance or MLOps product could truthfully copy as a set:

- **Agents advise, the policy engine decides.** Role agents propose; a deterministic policy engine with five hard gates (never averaged, client-facing capped at `GO_SUPERVISED`) issues the verdict, and nothing downstream can change it.
- **Tamper-evident trace.** Every step is recorded in a hash-chained log that can be verified and replayed.
- **Deployed % beside compliant %.** The dashboard shows the gap between what is live and what is actually compliant, per country and entity.

## Operating Context

- Entities are scoped by country; the dashboard follows the active country. Countries can be created by an admin, with policy documents pasted in to build that country's knowledge base.
- Use cases arrive by CSV import or by SOP intake (analyse a text or markdown procedure, promote it to a governed use case).
- Staged scenarios S1–S4 run on synthetic data; S3 runs on a sandbox copy of the use cases.
- The Sijil panel (runs, attestation, rejects per criterion, auto-filed pilot reports) is a labelled simulation; the live adapter is read-only and optional.
- Evaluation, accessibility lint and a technical report ship with the repo (`docs/eval/`, `docs/accessibility-check.md`, `docs/report/`).

## Capabilities and Constraints

- Next.js 16 / React 19 / Tailwind 4, Supabase backend. Existing features and routes are to be preserved: policy config, CSV import, federal dashboard, use-case pages, runs and trace viewer, HITL editor, SOP intake, country panel, Sijil panel.
- All entities and data are fictitious. The Sijil panel and any simulated data must stay clearly labelled as simulation.
- The accessibility lint (`npm run a11y`) is a standing requirement and must stay green.
- Layouts should not break under right-to-left languages; Arabic is a realistic future language. Not yet implemented, so not claimed as supported.
- Terminology: "verdict", "hard gate", "deployed %", "compliant %", "human-in-the-loop (HITL)", "Sijil", "use case", "entity", "trace".

## Brand Commitments

Binding visual constraint, stated by the user: **preserve the existing typography, the existing background texture, and the existing colour palette.** Any redesign changes layout, hierarchy, components and behaviour around them, not these three. Exact values are not recorded here; they live in the incumbent code and are for `/impeccable document` to capture.

## Evidence on Hand

- A working app with fictitious entities and data, a 32-source knowledge base (398 chunks, SHA-256 provenance) plus an 8-source Singapore addition, and a technical report PDF at `docs/report/prism-technical-report.pdf`.
- Demo script and voiceover notes in `docs/demo-script.md` and `docs/video-v3-voiceover.md`.
- No real customers, testimonials, or production deployment figures exist. Future work must not fabricate any.

## Product Principles

- **The verdict is never decorative.** Anything that looks like a decision must come from the deterministic engine, and the UI must make that provenance visible.
- **Show the gap, not just the score.** Deployed against compliant is the headline; never average away a failed hard gate.
- **Simulation is always labelled.** Simulated or fictitious data is marked wherever it appears.
- **Scope is explicit.** The active country and entity are always visible, and a role only sees what its role allows.
- **Auditable by default.** Every state shown can be traced to a recorded, verifiable step.

## Accessibility & Inclusion

Existing accessibility lint stays green (`npm run a11y`; see `docs/accessibility-check.md`). Right-to-left layouts should not be broken by new work.
