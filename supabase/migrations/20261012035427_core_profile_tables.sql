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
