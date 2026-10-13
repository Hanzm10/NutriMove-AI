import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adaptPlan, checkInDue, type AdaptState, type AdaptationResult, type CheckInAnswers } from "@/lib/agent/adaptation";
import { CALORIE_FLOOR } from "@/lib/agent/targets";
import type { Goal, Sex } from "@/lib/agent/types";
import { addDaysISO, todayISO } from "@/lib/dates";
import { generateMealPlan } from "@/lib/meals/plan";
import type { Database, Json } from "@/lib/supabase/database.types";
import { generateWorkoutPlan } from "@/lib/workout/plan";

type DB = SupabaseClient<Database>;

export type CheckInResult = Pick<AdaptationResult, "ruleIds" | "reasons" | "tips" | "kcalDelta" | "targetsChanged" | "workoutChange" | "posePaused" | "favorHighFiber"> & {
  before: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  after: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  trendPctPerWeek: number | null;
  plansRegenerated: { meals: boolean; workouts: boolean };
};

/** AGENT-02/03/04: store the check-in, adapt targets, regenerate both plans, and explain what changed. */
export async function runCheckIn(supabase: DB, userId: string, answers: CheckInAnswers): Promise<CheckInResult> {
  const today = todayISO();
  const weekAgo = addDaysISO(today, -6);

  // Record today's weight first so it's part of the trend.
  const { error: wErr } = await supabase
    .from("weight_logs").upsert({ user_id: userId, log_date: today, weight_kg: answers.weightKg }, { onConflict: "user_id,log_date" });
  if (wErr) throw wErr;

  const [{ data: profile }, { data: targets }, { data: screening }, { data: weights }, { data: logs }, { data: sessions }] = await Promise.all([
    supabase.from("profiles").select("goal, sex, adapt_state").eq("user_id", userId).single(),
    supabase.from("targets").select("*").eq("user_id", userId).lte("effective_from", today)
      .order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("screenings").select("flagged, pregnant_or_bf").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("weight_logs").select("log_date, weight_kg").eq("user_id", userId).gte("log_date", addDaysISO(today, -20)),
    supabase.from("food_logs").select("log_date, kcal").eq("user_id", userId).gte("log_date", weekAgo).lte("log_date", today),
    supabase.from("workout_sessions").select("session_sets(reps_counted, reps_good)").eq("user_id", userId)
      .gte("started_at", `${weekAgo}T00:00:00+08:00`),
  ]);
  if (!profile || !targets) throw new Error("Finish onboarding before checking in");

  const perDay = new Map<string, number>();
  for (const l of logs ?? []) perDay.set(l.log_date, (perDay.get(l.log_date) ?? 0) + Number(l.kcal));
  const loggedDays = perDay.size;
  const avgIntakeKcal = loggedDays ? [...perDay.values()].reduce((a, b) => a + b, 0) / loggedDays : null;

  let reps = 0, good = 0;
  for (const s of sessions ?? []) for (const set of s.session_sets ?? []) { reps += set.reps_counted; good += set.reps_good; }

  const sex = (profile.sex as Sex) ?? "female";
  const floorKcal = Math.max(CALORIE_FLOOR[sex], screening?.flagged ? targets.bmr : 0);
  const before = { kcal: targets.kcal, proteinG: targets.protein_g, carbsG: targets.carbs_g, fatG: targets.fat_g };
  const state = (profile.adapt_state ?? {}) as AdaptState;

  const r = adaptPlan({
    goal: (profile.goal as Goal) ?? "maintain",
    maintenanceOnly: Boolean(screening?.pregnant_or_bf),
    today,
    targets: before,
    floorKcal,
    weights: (weights ?? []).map((w) => ({ date: w.log_date, kg: Number(w.weight_kg) })),
    avgIntakeKcal,
    loggedDays,
    goodFormShare: reps >= 10 ? good / reps : null,
    checkIn: answers,
    state,
  });

  if (r.targetsChanged) {
    const { error } = await supabase.from("targets").insert({
      user_id: userId,
      kcal: r.targets.kcal,
      protein_g: r.targets.proteinG,
      carbs_g: r.targets.carbsG,
      fat_g: r.targets.fatG,
      fiber_g: targets.fiber_g,
      bmr: targets.bmr,
      tdee: targets.tdee,
      effective_from: today,
      explanation: { ruleIds: r.ruleIds, reasons: r.reasons, source: "check_in", previous: before } as Json,
    });
    if (error) throw error;
  }
  const { error: pErr } = await supabase.from("profiles").update({ adapt_state: r.state as Json }).eq("user_id", userId);
  if (pErr) throw pErr;

  // AGENT-04: next week's plans pick up the new targets, fiber preference and set adjustment.
  const plansRegenerated = { meals: false, workouts: false };
  try { await generateMealPlan(supabase, userId); plansRegenerated.meals = true; } catch (e) { console.error("check-in meal plan failed", e); }
  try { await generateWorkoutPlan(supabase, userId); plansRegenerated.workouts = true; } catch (e) { console.error("check-in workout plan failed", e); }

  const result: CheckInResult = {
    ruleIds: r.ruleIds,
    reasons: r.reasons,
    tips: r.tips,
    kcalDelta: r.kcalDelta,
    targetsChanged: r.targetsChanged,
    workoutChange: r.workoutChange,
    posePaused: r.posePaused,
    favorHighFiber: r.favorHighFiber,
    before,
    after: r.targets,
    trendPctPerWeek: r.trend?.pctPerWeek ?? null,
    plansRegenerated,
  };
  const { error: cErr } = await supabase.from("check_ins").insert({
    user_id: userId,
    check_date: today,
    weight_kg: answers.weightKg,
    adherence: answers.adherence,
    hunger: answers.hunger,
    energy: answers.energy,
    workout_difficulty: answers.difficulty,
    new_pain: answers.newPain,
    result: result as unknown as Json,
  });
  if (cErr) throw cErr;
  await supabase.from("agent_events").insert({
    user_id: userId,
    kind: "check_in.adapted",
    input: { answers, avgIntakeKcal, loggedDays, trend: r.trend, state } as unknown as Json,
    output: result as unknown as Json,
    rule_ids: r.ruleIds,
  });
  return result;
}

/** What the Overview needs: is a check-in due, and the latest result to show as "What changed". */
export async function loadCheckInStatus(supabase: DB, userId: string) {
  const today = todayISO();
  const [{ data: last }, { data: profile }] = await Promise.all([
    supabase.from("check_ins").select("check_date, result, created_at").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("onboarding_completed_at, adapt_state").eq("user_id", userId).single(),
  ]);
  const onboarded = profile?.onboarding_completed_at?.slice(0, 10) ?? null;
  return {
    due: checkInDue(last?.check_date ?? null, onboarded, today),
    last: last ? { date: last.check_date, result: last.result as unknown as CheckInResult } : null,
    posePaused: Boolean((profile?.adapt_state as AdaptState | null)?.posePaused),
  };
}
