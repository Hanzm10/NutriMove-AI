-- PRD §12.5 / §12.6: SUS and ISO/IEC 25010 questionnaire answers from pilot participants.
create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('sus', 'iso25010')),
  respondent_role text not null check (respondent_role in ('user', 'it_expert')),
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index survey_responses_user_idx on public.survey_responses (user_id);
alter table public.survey_responses enable row level security;
create policy "own rows" on public.survey_responses for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
