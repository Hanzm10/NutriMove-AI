-- AGENT-03/04: state carried between weekly check-ins, and each check-in's adaptation result.
-- Both tables already have "own rows" RLS policies.
alter table public.profiles add column if not exists adapt_state jsonb not null default '{}'::jsonb;
alter table public.check_ins add column if not exists result jsonb not null default '{}'::jsonb;
comment on column public.profiles.adapt_state is 'AGENT-03 state carried between check-ins (slow-loss streak, last difficulty, set adjustment, high-fiber, pose pause).';
comment on column public.check_ins.result is 'AGENT-04 adaptation output: rule ids, reasons, before/after targets, plan changes.';
