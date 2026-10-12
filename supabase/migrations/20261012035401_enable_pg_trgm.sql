-- NutriMove AI schema (PRD §9.3). Applied to the hosted project in these steps; keep files in sync with
-- `supabase migration list`. Every user table: user_id → auth.users (cascade, AUTH-04) + RLS user_id = auth.uid().

create extension if not exists pg_trgm with schema extensions;
