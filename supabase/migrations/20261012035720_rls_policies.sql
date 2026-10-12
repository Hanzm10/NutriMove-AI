create policy "own rows" on public.profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.user_settings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.screenings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.targets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.food_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.water_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.weight_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.recipe_ratings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.meal_plans for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.meal_plan_items for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.workout_plans for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.workout_plan_items for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.workout_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.session_sets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.check_ins for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.agent_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Consents are an audit trail: insert + read only.
create policy "read own consents" on public.consents for select to authenticated using ((select auth.uid()) = user_id);
create policy "add own consents" on public.consents for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "read catalogue and own foods" on public.foods for select to authenticated using (user_id is null or (select auth.uid()) = user_id);
create policy "manage own custom foods" on public.foods for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and source = 'custom');

create policy "read recipes" on public.recipes for select to authenticated using (true);
create policy "read exercises" on public.exercises for select to authenticated using (true);
