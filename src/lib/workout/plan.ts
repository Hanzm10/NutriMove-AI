import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdaptState } from "@/lib/agent/adaptation";
import { recommendWorkoutPlan, type CatalogExercise, type WorkoutProfile } from "@/lib/agent/workout-recommender";
import { addDaysISO, todayISO } from "@/lib/dates";
import type { Database, Json } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

/** Slugs the live coach can analyse, mapped to analyzer kinds. */
export const POSE_KIND_BY_SLUG = { squat: "squat", pushup: "pushup", "reverse-lunge": "lunge" } as const;

/** WORK-01: build this week's plan from the profile + latest screening and store it. Plan starts today. */
export async function generateWorkoutPlan(supabase: DB, userId: string) {
  const [{ data: profile }, { data: screening }, { data: exercises }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("screenings").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("exercises").select("id, slug, name, muscle_groups, equipment, difficulty, impact, pose_supported, contraindications"),
  ]);
  if (!profile || !exercises?.length) throw new Error("Missing profile or exercise catalogue");

  const parq = (screening?.parq ?? {}) as Record<string, boolean>;
  const adapt = (profile.adapt_state ?? {}) as AdaptState;
  const p: WorkoutProfile = {
    goal: (profile.goal as WorkoutProfile["goal"]) ?? "maintain",
    experience: (profile.experience_level as WorkoutProfile["experience"]) ?? "beginner",
    equipment: profile.equipment ?? ["none"],
    daysPerWeek: profile.days_per_week ?? 3,
    minutesPerSession: profile.minutes_per_session ?? 30,
    beginnerCap: Boolean(screening?.flagged),
    lowImpactOnly: Boolean(screening?.pregnant_or_bf || parq.bone_joint || adapt.posePaused),
    setAdjust: adapt.setAdjust ?? 0,
  };
  const plan = recommendWorkoutPlan(p, exercises as CatalogExercise[]);
  const weekStart = todayISO();

  const { data: row, error } = await supabase
    .from("workout_plans")
    .insert({
      user_id: userId,
      week_start: weekStart,
      split: plan.split,
      explanation: { ruleIds: plan.ruleIds, reasons: plan.reasons, focus: plan.days.map((d) => d.focus) } as Json,
    })
    .select("id")
    .single();
  if (error || !row) throw error ?? new Error("Could not save plan");

  const idBySlug = new Map(exercises.map((e) => [e.slug, e.id]));
  const items = plan.days.flatMap((d) =>
    d.items.map((it, idx) => ({
      user_id: userId,
      workout_plan_id: row.id,
      day: addDaysISO(weekStart, d.dayOffset),
      order_idx: idx,
      exercise_id: idBySlug.get(it.slug)!,
      sets: it.sets,
      reps: it.reps,
      rest_s: it.restS,
    })),
  );
  const { error: iErr } = await supabase.from("workout_plan_items").insert(items);
  if (iErr) throw iErr;
  await supabase.from("agent_events").insert({
    user_id: userId,
    kind: "workout_plan.generated",
    input: p as unknown as Json,
    output: { split: plan.split, days: plan.days.length } as Json,
    rule_ids: plan.ruleIds,
  });
  return row.id;
}

export type PlanView = Awaited<ReturnType<typeof loadCurrentPlan>>;

/** Latest plan with its items and exercise details, grouped by day. */
export async function loadCurrentPlan(supabase: DB, userId: string) {
  const { data: plan } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return null;
  const { data: items } = await supabase
    .from("workout_plan_items")
    .select("id, day, order_idx, sets, reps, rest_s, exercise:exercises(id, slug, name, muscle_groups, pose_supported, steps, cues)")
    .eq("workout_plan_id", plan.id)
    .order("day")
    .order("order_idx");
  const today = todayISO();
  const { data: sessions } = await supabase
    .from("workout_sessions")
    .select("plan_item_id, started_at")
    .eq("user_id", userId)
    .gte("started_at", `${plan.week_start}T00:00:00+08:00`);
  const done = new Set((sessions ?? []).map((s) => s.plan_item_id).filter(Boolean));
  const days = new Map<string, NonNullable<typeof items>>();
  for (const it of items ?? []) days.set(it.day, [...(days.get(it.day) ?? []), it]);
  return {
    plan,
    today,
    days: [...days.entries()].map(([day, list]) => ({
      day,
      items: list.map((i) => ({ ...i, done: done.has(i.id) })),
    })),
  };
}

/** Sidebar weekly goal: planned training days this plan week vs days with at least one logged session. */
export async function weeklyProgress(supabase: DB, userId: string) {
  const { data: plan } = await supabase
    .from("workout_plans").select("id, week_start").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!plan) return { done: 0, planned: 0 };
  const [{ data: items }, { data: sessions }] = await Promise.all([
    supabase.from("workout_plan_items").select("day").eq("workout_plan_id", plan.id),
    supabase.from("workout_sessions").select("started_at").eq("user_id", userId)
      .gte("started_at", `${plan.week_start}T00:00:00+08:00`)
      .lt("started_at", `${addDaysISO(plan.week_start, 7)}T00:00:00+08:00`),
  ]);
  const planned = new Set((items ?? []).map((i) => i.day)).size;
  const done = new Set((sessions ?? []).map((s) => todayISO(new Date(s.started_at)))).size;
  return { done: Math.min(done, planned), planned };
}
