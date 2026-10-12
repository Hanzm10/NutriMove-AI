-- NutriMove AI: initial schema (PRD §9.3).
-- Every user-owned table has user_id → auth.users (cascade delete, AUTH-04) and RLS user_id = auth.uid().
-- Catalog tables (foods with user_id null, recipes, exercises) are readable by signed-in users and
-- writable only by the service role (seed scripts / Edge Functions).

create extension if not exists pg_trgm with schema extensions;

-- ── helpers ─────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text,
  sex text check (sex in ('male', 'female')),
  birthdate date,
  height_cm numeric(5,1) check (height_cm between 100 and 250),
  weight_kg numeric(5,1) check (weight_kg between 30 and 300),
  target_weight_kg numeric(5,1) check (target_weight_kg between 30 and 300),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal text check (goal in ('lose', 'maintain', 'gain')),
  experience_level text check (experience_level in ('beginner', 'intermediate')),
  equipment text[] not null default '{}',
  days_per_week smallint check (days_per_week between 2 and 6),
  minutes_per_session smallint check (minutes_per_session between 10 and 120),
  diet_prefs jsonb not null default '{}'::jsonb,
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  onboarding_step smallint not null default 0,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create an empty profile + settings row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;

-- ── settings, consent, screening ────────────────────────────────────────────
create table public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  larger_text boolean not null default false,
  high_contrast boolean not null default false,
  reduce_motion boolean not null default false,
  tts_cues boolean not null default true,
  water_goal smallint not null default 8 check (water_goal between 1 and 20),
  updated_at timestamptz not null default now()
);
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null check (type in ('data', 'health', 'camera', 'camera_remote')),
  version text not null,
  accepted_at timestamptz not null default now()
);
create index on public.consents (user_id, type);

create table public.screenings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  age_ok boolean not null,
  pregnant_or_bf boolean not null default false,
  parq jsonb not null default '{}'::jsonb,
  flagged boolean not null default false,
  clearance_ack boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.screenings (user_id, created_at desc);

-- ── targets (versioned) ─────────────────────────────────────────────────────
create table public.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kcal integer not null,
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  fiber_g integer not null default 25,
  bmr integer not null,
  tdee integer not null,
  effective_from date not null default current_date,
  explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.targets (user_id, effective_from desc, created_at desc);

-- ── food ────────────────────────────────────────────────────────────────────
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade, -- null = shared catalogue
  source text not null check (source in ('fnri', 'usda', 'off', 'custom')),
  external_id text,
  name text not null,
  name_local text,
  brand text,
  serving_label text,
  serving_g numeric(7,2),
  kcal_100g numeric(7,2) not null,
  protein_100g numeric(6,2) not null default 0,
  carbs_100g numeric(6,2) not null default 0,
  fat_100g numeric(6,2) not null default 0,
  fiber_100g numeric(6,2) not null default 0,
  source_ref text,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create index foods_name_trgm on public.foods using gin (name extensions.gin_trgm_ops);
create index foods_name_local_trgm on public.foods using gin (name_local extensions.gin_trgm_ops);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  food_id uuid references public.foods on delete set null,
  recipe_id uuid,
  log_date date not null default current_date,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null,
  quantity_g numeric(7,2) not null check (quantity_g > 0),
  -- nutrient snapshot (FOOD-04)
  kcal numeric(7,1) not null,
  protein_g numeric(6,1) not null default 0,
  carbs_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  fiber_g numeric(6,1) not null default 0,
  from_plan_item_id uuid,
  created_at timestamptz not null default now()
);
create index on public.food_logs (user_id, log_date);

create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  log_date date not null default current_date,
  glasses smallint not null default 0 check (glasses between 0 and 30),
  unique (user_id, log_date)
);

create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  log_date date not null default current_date,
  weight_kg numeric(5,1) not null check (weight_kg between 30 and 300),
  unique (user_id, log_date)
);

-- ── recipes & meal plans ────────────────────────────────────────────────────
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  is_filipino boolean not null default false,
  meal_slots text[] not null,
  tags text[] not null default '{}',
  allergens text[] not null default '{}',
  diet_pattern text not null default 'omnivore' check (diet_pattern in ('omnivore', 'pescatarian', 'vegetarian')),
  cost_level text not null default 'low' check (cost_level in ('low', 'mid')),
  prep_minutes smallint,
  serving_g numeric(7,2) not null,
  kcal numeric(7,1) not null,
  protein_g numeric(6,1) not null,
  carbs_g numeric(6,1) not null,
  fat_g numeric(6,1) not null,
  fiber_g numeric(6,1) not null default 0,
  ingredients jsonb not null default '[]'::jsonb,
  instructions text,
  image_url text,
  source_ref text
);
alter table public.food_logs
  add constraint food_logs_recipe_fk foreign key (recipe_id) references public.recipes on delete set null;

create table public.recipe_ratings (
  user_id uuid not null references auth.users on delete cascade,
  recipe_id uuid not null references public.recipes on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.meal_plans (user_id, week_start desc);

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  meal_plan_id uuid not null references public.meal_plans on delete cascade,
  day date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid not null references public.recipes,
  servings numeric(4,2) not null default 1,
  score numeric(6,4)
);
create index on public.meal_plan_items (meal_plan_id, day);

-- ── exercises & workouts ────────────────────────────────────────────────────
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

-- ── row level security ──────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'user_settings', 'consents', 'screenings', 'targets', 'food_logs', 'water_logs',
    'weight_logs', 'recipe_ratings', 'meal_plans', 'meal_plan_items', 'workout_plans',
    'workout_plan_items', 'workout_sessions', 'session_sets', 'check_ins', 'agent_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Consents are an audit trail: insert + read only.
drop policy "own rows" on public.consents;
create policy "read own consents" on public.consents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "add own consents" on public.consents for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Catalogues
alter table public.foods enable row level security;
create policy "read catalogue and own foods" on public.foods for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy "manage own custom foods" on public.foods for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and source = 'custom');

alter table public.recipes enable row level security;
create policy "read recipes" on public.recipes for select to authenticated using (true);

alter table public.exercises enable row level security;
create policy "read exercises" on public.exercises for select to authenticated using (true);

alter table public.api_usage enable row level security; -- no policies: service role only
