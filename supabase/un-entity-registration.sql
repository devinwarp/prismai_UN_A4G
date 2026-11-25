-- Apply after the entity tables are installed. Existing country links still come from the country log.
alter table public.un_entities add column if not exists country_id text;
