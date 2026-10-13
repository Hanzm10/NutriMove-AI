"use server";

import { revalidatePath } from "next/cache";
import { ageFromBirthdate, computeTargets, screen, type ActivityLevel, type Goal, type Sex } from "@/lib/agent";
import {
  bodySchema, dietSchema, goalSchema, screeningSchema, trainingSchema,
  type BodyForm, type DietForm, type GoalForm, type ScreeningForm, type TrainingForm,
} from "@/lib/onboarding/schema";
import { requireUser } from "@/lib/supabase/auth";
import type { Json } from "@/lib/supabase/database.types";
import { generateWorkoutPlan } from "@/lib/workout/plan";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

function zodErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) out[i.path.join(".")] ??= i.message;
  return out;
}

export type ScreeningOutcome = {
  status: "ok" | "flagged" | "blocked";
  reasons: string[];
  requiresClearanceAck: boolean;
};

/** ONB-01…04 */
export async function saveScreening(input: ScreeningForm): Promise<ActionResult<ScreeningOutcome>> {
  const parsed = screeningSchema.safeParse(input);
  if (!parsed.success) return fail("Please check the highlighted answers.", zodErrors(parsed.error.issues));
  const f = parsed.data;
  const { supabase, user } = await requireUser();

  const result = screen({
    ageYears: ageFromBirthdate(f.birthdate),
    pregnantOrBreastfeeding: f.sex === "female" && f.pregnantOrBreastfeeding,
    parq: f.parq,
  });
  if (result.requiresClearanceAck && !f.clearanceAck) {
    return fail("Please confirm you'll check with a doctor before continuing.", {
      clearanceAck: "Required because of your health answers",
    });
  }

  const { error: sErr } = await supabase.from("screenings").insert({
    user_id: user.id,
    age_ok: result.status !== "blocked",
    pregnant_or_bf: f.sex === "female" && f.pregnantOrBreastfeeding,
    parq: f.parq,
    flagged: result.status === "flagged",
    clearance_ack: f.clearanceAck,
  });
  if (sErr) return fail("Could not save your answers. Please try again.");

  const { error: pErr } = await supabase
    .from("profiles")
    .update({ sex: f.sex, birthdate: f.birthdate, onboarding_step: result.status === "blocked" ? 0 : 1 })
    .eq("user_id", user.id);
  if (pErr) return fail("Could not save your answers. Please try again.");

  return {
    ok: true,
    data: { status: result.status, reasons: result.reasons, requiresClearanceAck: result.requiresClearanceAck },
  };
}

export async function saveBody(input: BodyForm): Promise<ActionResult> {
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodErrors(parsed.error.issues));
  const { supabase, user } = await requireUser();
  const f = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({ height_cm: f.heightCm, weight_kg: f.weightKg, target_weight_kg: f.targetWeightKg, onboarding_step: 2 })
    .eq("user_id", user.id);
  if (error) return fail("Could not save. Please try again.");
  // First weight entry for the trend (AGENT-03).
  await supabase.from("weight_logs").upsert(
    { user_id: user.id, weight_kg: f.weightKg },
    { onConflict: "user_id,log_date" },
  );
  return { ok: true };
}

export async function saveGoal(input: GoalForm): Promise<ActionResult> {
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return fail("Please choose an option.", zodErrors(parsed.error.issues));
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ goal: parsed.data.goal, activity_level: parsed.data.activity, onboarding_step: 3 })
    .eq("user_id", user.id);
  return error ? fail("Could not save. Please try again.") : { ok: true };
}

export async function saveTraining(input: TrainingForm): Promise<ActionResult> {
  const parsed = trainingSchema.safeParse(input);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodErrors(parsed.error.issues));
  const { supabase, user } = await requireUser();
  const f = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({
      experience_level: f.experience,
      equipment: f.equipment,
      days_per_week: f.daysPerWeek,
      minutes_per_session: f.minutesPerSession,
      onboarding_step: 4,
    })
    .eq("user_id", user.id);
  return error ? fail("Could not save. Please try again.") : { ok: true };
}

export type PlanSummary = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  bmr: number;
  tdee: number;
  expectedWeeklyChangeKg: number;
  timelineWeeks: [number, number] | null;
  reasons: string[];
  flagged: boolean;
};

/** Saves diet preferences, then computes + stores targets (ONB-07, TGT-*, AGENT-01). */
export async function saveDietAndFinish(input: DietForm): Promise<ActionResult<PlanSummary>> {
  const parsed = dietSchema.safeParse(input);
  if (!parsed.success) return fail("Please check your answers.", zodErrors(parsed.error.issues));
  const { supabase, user } = await requireUser();

  const { error: dErr } = await supabase
    .from("profiles")
    .update({ diet_prefs: parsed.data as unknown as Json, onboarding_step: 5 })
    .eq("user_id", user.id);
  if (dErr) return fail("Could not save. Please try again.");

  const [{ data: profile }, { data: screening }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase
      .from("screenings")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!profile || !screening || !screening.age_ok) return fail("Please complete the health screening first.");
  const { sex, birthdate, height_cm, weight_kg, activity_level, goal } = profile;
  if (!sex || !birthdate || !height_cm || !weight_kg || !activity_level || !goal) {
    return fail("Some of your details are missing. Please go back and complete every step.");
  }

  const targets = computeTargets({
    sex: sex as Sex,
    ageYears: ageFromBirthdate(birthdate),
    heightCm: Number(height_cm),
    weightKg: Number(weight_kg),
    activity: activity_level as ActivityLevel,
    goal: goal as Goal,
    maintenanceOnly: screening.pregnant_or_bf,
    screeningFlagged: screening.flagged,
    targetWeightKg: profile.target_weight_kg ? Number(profile.target_weight_kg) : null,
  });

  const explanation = { ruleIds: targets.ruleIds, reasons: targets.reasons, effectiveGoal: targets.effectiveGoal };
  const { error: tErr } = await supabase.from("targets").insert({
    user_id: user.id,
    kcal: targets.kcal,
    protein_g: targets.proteinG,
    carbs_g: targets.carbsG,
    fat_g: targets.fatG,
    fiber_g: targets.fiberG,
    bmr: targets.bmr,
    tdee: targets.tdee,
    explanation,
  });
  if (tErr) return fail("Could not save your targets. Please try again.");

  await Promise.all([
    supabase.from("agent_events").insert({
      user_id: user.id,
      kind: "targets.initial",
      input: { profile_step: "onboarding", flagged: screening.flagged } as Json,
      output: { kcal: targets.kcal, protein_g: targets.proteinG } as Json,
      rule_ids: targets.ruleIds,
    }),
    supabase
      .from("profiles")
      .update({ onboarding_step: 6, onboarding_completed_at: new Date().toISOString() })
      .eq("user_id", user.id),
  ]);
  // WORK-01: first weekly plan. A failure here must not block onboarding; /workout offers a retry.
  try {
    await generateWorkoutPlan(supabase, user.id);
  } catch (e) {
    console.error("workout plan generation failed", e);
  }
  revalidatePath("/", "layout");

  return {
    ok: true,
    data: {
      kcal: targets.kcal,
      proteinG: targets.proteinG,
      carbsG: targets.carbsG,
      fatG: targets.fatG,
      fiberG: targets.fiberG,
      bmr: targets.bmr,
      tdee: targets.tdee,
      expectedWeeklyChangeKg: targets.expectedWeeklyChangeKg,
      timelineWeeks: targets.timelineWeeks,
      reasons: targets.reasons,
      flagged: screening.flagged,
    },
  };
}
