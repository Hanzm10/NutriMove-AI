-- NutriMove demo history (Day 7). Gives the demo account two weeks of realistic data so Overview, Progress and the
-- weekly check-in have something to show.
--
-- 1. In the app, sign up with the demo email and finish onboarding (consent, screening, profile).
-- 2. Supabase → SQL editor → paste this file, change demo_email below if needed, Run.
-- Safe to re-run: it replaces only the demo account's past-day logs and seeded sessions; today stays untouched.
do $$
declare
  demo_email text := 'demo@nutrimove.app';
  uid uuid;
  start_kg numeric;
  d int;
  r record;
  sid uuid;
  ex record;
begin
  select id into uid from auth.users where email = demo_email;
  if uid is null then raise exception 'No account with email %. Sign up in the app first.', demo_email; end if;
  if not exists (select 1 from public.targets where user_id = uid) then
    raise exception 'Finish onboarding for % first (no targets yet).', demo_email;
  end if;
  select weight_kg into start_kg from public.profiles where user_id = uid;
  start_kg := coalesce(start_kg, 70) + 1.0;  -- history starts ~1 kg heavier, trending down

  -- Onboarded 14 days ago, so the weekly check-in is due today (live adaptation demo).
  update public.profiles set onboarding_completed_at = now() - interval '14 days' where user_id = uid;

  delete from public.food_logs where user_id = uid and log_date < current_date;
  delete from public.weight_logs where user_id = uid and log_date < current_date;
  delete from public.water_logs where user_id = uid and log_date < current_date;
  delete from public.workout_sessions where user_id = uid and started_at < current_date;

  for d in 1..13 loop
    -- Meals: one recipe per slot, rotating through the catalogue (all FNRI-based).
    for r in
      select s.slot, x.id, x.name, x.serving_g, x.kcal, x.protein_g, x.carbs_g, x.fat_g, x.fiber_g
      from unnest(array['breakfast', 'lunch', 'dinner', 'snack']) as s(slot)
      cross join lateral (
        select * from public.recipes rc where s.slot = any (rc.meal_slots)
        order by md5(rc.slug || d::text) limit 1
      ) x
    loop
      continue when r.slot = 'snack' and d % 3 = 0;  -- some days without a snack
      insert into public.food_logs (user_id, recipe_id, log_date, meal_slot, name, quantity_g, kcal, protein_g, carbs_g, fat_g, fiber_g)
      values (uid, r.id, current_date - d, r.slot, r.name, r.serving_g, r.kcal, r.protein_g, r.carbs_g, r.fat_g, r.fiber_g);
    end loop;

    insert into public.weight_logs (user_id, log_date, weight_kg)
    values (uid, current_date - d, round(start_kg - (13 - d) * 0.07 + ((d * 37) % 5 - 2) * 0.1, 1));
    insert into public.water_logs (user_id, log_date, glasses) values (uid, current_date - d, 5 + (d * 7) % 4);

    -- Camera sessions every other day: squats and lunges through the laptop coach.
    if d % 2 = 1 then
      for ex in select id, slug from public.exercises where slug in ('squat', 'reverse-lunge') loop
        insert into public.workout_sessions (user_id, exercise_id, started_at, ended_at, pose_backend, avg_fps, p50_latency_ms, p95_latency_ms, device_class, rating)
        values (uid, ex.id, (current_date - d) + time '18:30', (current_date - d) + time '18:42', 'remote',
                12.5 + (d % 3) * 0.4, 58 + d % 5, 80 + (d * 3) % 25, 'iphone', case when d > 7 then 'hard' else 'right' end)
        returning id into sid;
        insert into public.session_sets (user_id, session_id, set_idx, reps_counted, reps_good, error_counts, duration_s)
        select uid, sid, k, 12, 12 - least(3, (d + k) % 4),
               case when (d + k) % 4 = 0 then '{}'::jsonb
                    else jsonb_build_object(case when ex.slug = 'squat' then 'SQ_DEPTH' else 'LU_DEPTH' end, least(3, (d + k) % 4)) end,
               40 + k * 3
        from generate_series(0, 2) as k;
      end loop;
    end if;
  end loop;

  raise notice 'Demo history added for % (13 days).', demo_email;
end $$;
