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

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  food_id uuid references public.foods on delete set null,
  recipe_id uuid references public.recipes on delete set null,
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
