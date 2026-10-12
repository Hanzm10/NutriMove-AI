create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  muscle_groups text[] not null default '{}',
  equipment text[] not null default '{}',
  difficulty smallint not null check (difficulty between 1 and 3),
  impact text not null default 'low' check (impact in ('low', 'high')),
  pose_supported boolean not null default false,
  contraindications text[] not null default '{}',
  regression_slug text,
  progression_slug text,
  steps text[] not null default '{}',
  cues text[] not null default '{}'
);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  split text not null,
  explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.workout_plans (user_id, week_start desc);

create table public.workout_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  workout_plan_id uuid not null references public.workout_plans on delete cascade,
  day date not null,
  order_idx smallint not null,
  exercise_id uuid not null references public.exercises,
  sets smallint not null,
  reps smallint not null,
  rest_s smallint not null default 60
);
create index on public.workout_plan_items (workout_plan_id, day, order_idx);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  plan_item_id uuid references public.workout_plan_items on delete set null,
  exercise_id uuid not null references public.exercises,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  pose_backend text check (pose_backend in ('instanthmr', 'remote', 'mediapipe', 'manual')),
  avg_fps numeric(5,1),
  rating text check (rating in ('easy', 'right', 'hard')),
  created_at timestamptz not null default now()
);
create index on public.workout_sessions (user_id, started_at desc);

create table public.session_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  session_id uuid not null references public.workout_sessions on delete cascade,
  set_idx smallint not null,
  reps_counted smallint not null default 0,
  reps_good smallint not null default 0,
  error_counts jsonb not null default '{}'::jsonb,
  duration_s numeric(6,1)
);
create index on public.session_sets (session_id);

-- ── agent loop ──────────────────────────────────────────────────────────────
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  check_date date not null default current_date,
  weight_kg numeric(5,1) check (weight_kg between 30 and 300),
  adherence smallint check (adherence between 1 and 5),
  hunger smallint check (hunger between 1 and 5),
  energy smallint check (energy between 1 and 5),
  workout_difficulty text check (workout_difficulty in ('easy', 'right', 'hard')),
  new_pain boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.check_ins (user_id, check_date desc);

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  rule_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.agent_events (user_id, created_at desc);

-- Per-user request counter for Edge Functions (service role only).
create table public.api_usage (
  user_id uuid not null references auth.users on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket, window_start)
);
