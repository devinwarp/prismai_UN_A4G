-- Seed: entity goals for goal alignment (C2-10). Generated from ENTITY_GOALS in
-- src/lib/un/goals.ts (tests/un-goals.test.ts checks this file matches).
-- Run after supabase/un-federal-t1.sql. Needs the use cases imported
-- first: it adds one row per entity found in un_use_cases. NOT APPLIED.
insert into public.un_entities (org_id, name, sector, goals)
select distinct u.org_id, u.entity, u.entity_sector, g.goals
from public.un_use_cases u
join (values
    ('Marsa Public Services Authority', '[{"id":"MARSA-G1","text":"Answer licence and permit questions correctly the first time","criterion":"accuracy"},{"id":"MARSA-G2","text":"Never quote a fee that is not in the published fee table","criterion":"hallucination"},{"id":"MARSA-G3","text":"An officer releases every message that reaches a citizen","criterion":"human_final_approval"},{"id":"MARSA-G4","text":"Tell every citizen they are dealing with an AI assistant","criterion":"ai_disclosure"}]'::jsonb),
    ('Qanat Transport and Mobility Agency', '[{"id":"QANAT-G1","text":"Route and permit answers match the current timetable and rules","criterion":"accuracy"},{"id":"QANAT-G2","text":"Never invent a service, fare or closure","criterion":"hallucination"},{"id":"QANAT-G3","text":"A person approves every enforcement or fine notice","criterion":"human_final_approval"}]'::jsonb),
    ('Raya Education and Skills Council', '[{"id":"RAYA-G1","text":"Eligibility and enrolment guidance is correct","criterion":"accuracy"},{"id":"RAYA-G2","text":"Never state an accreditation or deadline that does not exist","criterion":"hallucination"},{"id":"RAYA-G3","text":"A named officer approves every decision about a learner''s record","criterion":"human_final_approval"},{"id":"RAYA-G4","text":"Parents and learners are told when an answer is AI-generated","criterion":"ai_disclosure"}]'::jsonb),
    ('Sahel Federal Workforce Agency', '[{"id":"SAHEL-G1","text":"Job-matching and benefit-rule answers are accurate","criterion":"accuracy"},{"id":"SAHEL-G2","text":"Never invent an entitlement or an employer","criterion":"hallucination"},{"id":"SAHEL-G3","text":"A caseworker approves every decision that affects a benefit","criterion":"human_final_approval"}]'::jsonb),
    ('Wahat Health Services Authority', '[{"id":"WAHAT-G1","text":"Appointment and service information is correct","criterion":"accuracy"},{"id":"WAHAT-G2","text":"Never give clinical advice or invent a service","criterion":"hallucination"},{"id":"WAHAT-G3","text":"A clinician or officer approves every patient-facing message","criterion":"human_final_approval"},{"id":"WAHAT-G4","text":"Patients are told they are talking to an AI assistant","criterion":"ai_disclosure"}]'::jsonb)
) as g(name, goals) on g.name = u.entity
on conflict (org_id, name) do update set sector = excluded.sector, goals = excluded.goals;
