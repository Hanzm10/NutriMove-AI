import type { Explanation, Goal } from "./types";

// PRD §7.8 AGENT-03 / AGENT-06 and Appendix A (weight trend). Pure: check-in + history in, adjustments out.

export type WeightPoint = { date: string; kg: number };

export type WeightTrend = {
  /** Least-squares slope, kg per day. */
  slopeKgPerDay: number;
  /** slope·7 / mean weight × 100; negative = losing. */
  pctPerWeek: number;
  points: number;
  spanDays: number;
};

const DAY_MS = 86_400_000;
const dayIndex = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/**
 * Appendix A: slope of weight vs day over the last `windowDays` (inclusive of today). Needs at least
 * two weigh-ins at least `minSpanDays` apart; otherwise there's no trend to act on.
 */
export function weightTrend(points: WeightPoint[], today: string, windowDays = 14, minSpanDays = 6): WeightTrend | null {
  const t = dayIndex(today);
  const pts = points
    .map((p) => ({ x: dayIndex(p.date), y: p.kg }))
    .filter((p) => p.x <= t && p.x > t - windowDays && Number.isFinite(p.y));
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.x);
  const spanDays = Math.max(...xs) - Math.min(...xs);
  if (spanDays < minSpanDays) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  let num = 0, den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return {
    slopeKgPerDay: slope,
    pctPerWeek: Math.round(((slope * 7) / my) * 100 * 100) / 100,
    points: pts.length,
    spanDays,
  };
}

export type CheckInAnswers = {
  weightKg: number;
  adherence: number; // 1–5
  hunger: number; // 1–5
  energy: number; // 1–5
  difficulty: "easy" | "right" | "hard";
  newPain: boolean;
};

/** Carried between check-ins (stored on the profile). */
export type AdaptState = {
  /** Consecutive check-ins where a "lose" user lost < 0.25%/wk. */
  slowLossStreak?: number;
  /** Previous check-in's workout difficulty answer. */
  lastDifficulty?: "easy" | "right" | "hard" | null;
  /** Cumulative sets adjustment applied to the workout plan (−2…+2). */
  setAdjust?: number;
  favorHighFiber?: boolean;
  posePaused?: boolean;
};

export type MacroTargets = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type AdaptationInput = {
  goal: Goal;
  /** From screening (ONB-03): pregnancy/breastfeeding forces maintenance, whatever goal was chosen. */
  maintenanceOnly?: boolean;
  today: string;
  targets: MacroTargets;
  /** Lowest kcal the user may be given (TGT-04: sex floor, or BMR if screening flagged). */
  floorKcal: number;
  weights: WeightPoint[];
  /** Average logged kcal/day over the past week, from days that have logs. */
  avgIntakeKcal: number | null;
  loggedDays: number;
  /** Share of reps without form errors over the past week (0–1), if any camera sessions. */
  goodFormShare: number | null;
  checkIn: CheckInAnswers;
  state: AdaptState;
};

export type AdaptationResult = Explanation & {
  trend: WeightTrend | null;
  kcalDelta: number;
  targets: MacroTargets;
  targetsChanged: boolean;
  workoutChange: "progress" | "regress" | "none";
  favorHighFiber: boolean;
  posePaused: boolean;
  /** Short adherence/safety tips shown alongside the changes. */
  tips: string[];
  state: AdaptState;
};

const MIN_LOGGED_DAYS = 3;
const MAX_SET_ADJUST = 2;

export function adaptPlan(input: AdaptationInput): AdaptationResult {
  const { checkIn, targets } = input;
  const goal: Goal = input.maintenanceOnly ? "maintain" : input.goal;
  const ruleIds: string[] = [];
  const reasons: string[] = [];
  if (input.maintenanceOnly && input.goal !== "maintain") {
    ruleIds.push("ONB-03");
    reasons.push("Your calories stay at maintenance because of your screening answers, whatever your goal.");
  }
  const tips: string[] = [];
  const state: AdaptState = { ...input.state };
  const trend = weightTrend(input.weights, input.today);

  // Adherence: compare logged intake with the target before blaming the target.
  const intakeGap =
    input.avgIntakeKcal != null && input.loggedDays >= MIN_LOGGED_DAYS
      ? (input.avgIntakeKcal - targets.kcal) / targets.kcal
      : null;

  let kcalDelta = 0;
  if (intakeGap != null && Math.abs(intakeGap) > 0.2) {
    ruleIds.push("AGT-ADHERENCE");
    const pct = Math.round(Math.abs(intakeGap) * 100);
    reasons.push(
      `Your logged intake averaged ${Math.round(input.avgIntakeKcal!)} kcal, ${pct}% ${intakeGap > 0 ? "above" : "below"} your ${targets.kcal} kcal target, so we kept your targets the same this week.`,
    );
    tips.push(
      intakeGap > 0
        ? "Try planning your meals from the Meal plan tab; its portions already fit your target."
        : "You're eating well under your target. Add a planned snack so your body has enough fuel to train.",
    );
    state.slowLossStreak = 0;
  } else if (!trend) {
    ruleIds.push("AGT-NO-TREND");
    reasons.push("We need at least two weigh-ins about a week apart to see your trend, so your calories stay the same for now.");
  } else {
    const p = trend.pctPerWeek;
    const pace = `${p > 0 ? "+" : ""}${p.toFixed(2)}% of body weight per week`;
    if (goal === "lose") {
      if (p < -1) {
        kcalDelta = 150;
        state.slowLossStreak = 0;
        ruleIds.push("AGT-LOSE-FAST");
        reasons.push(`You're losing faster than the safe limit (${pace}), so we added 150 kcal/day.`);
      } else if (p > -0.25) {
        state.slowLossStreak = (state.slowLossStreak ?? 0) + 1;
        const onTarget = intakeGap != null && Math.abs(intakeGap) <= 0.1;
        if (state.slowLossStreak >= 2 && onTarget) {
          kcalDelta = -150;
          state.slowLossStreak = 0;
          ruleIds.push("AGT-LOSE-SLOW");
          reasons.push(`Your weight has been nearly flat for two check-ins (${pace}) while you hit your target, so we lowered calories by 150 kcal/day.`);
        } else {
          ruleIds.push("AGT-LOSE-WAIT");
          reasons.push(
            !onTarget
              ? `Weight loss is slow (${pace}). Log your meals for at least ${MIN_LOGGED_DAYS} days so we can tell whether the target or the routine needs to change.`
              : `Weight loss is slow (${pace}). If it stays this way at your next check-in, we'll lower calories a little.`,
          );
        }
      } else {
        state.slowLossStreak = 0;
        ruleIds.push("AGT-ON-TRACK");
        reasons.push(`You're losing at a steady, safe pace (${pace}). No calorie change needed.`);
      }
    } else if (goal === "gain") {
      if (p < 0.1) {
        kcalDelta = 150;
        ruleIds.push("AGT-GAIN-SLOW");
        reasons.push(`Weight gain is slower than planned (${pace}), so we added 150 kcal/day.`);
      } else if (p > 0.5) {
        kcalDelta = -100;
        ruleIds.push("AGT-GAIN-FAST");
        reasons.push(`You're gaining faster than planned (${pace}), so we removed 100 kcal/day to keep it lean.`);
      } else {
        ruleIds.push("AGT-ON-TRACK");
        reasons.push(`You're gaining at a steady pace (${pace}). No calorie change needed.`);
      }
    } else {
      ruleIds.push("AGT-ON-TRACK");
      reasons.push(`Your weight trend is ${pace}. Maintenance targets stay the same.`);
    }
  }

  // Apply the calorie change: carbs absorb it, protein and fat stay; never below the floor.
  let next: MacroTargets = { ...targets };
  if (kcalDelta !== 0) {
    let kcal = Math.max(input.floorKcal, targets.kcal + kcalDelta);
    kcal = Math.round(kcal / 10) * 10;
    if (kcal < input.floorKcal) kcal = Math.ceil(input.floorKcal / 10) * 10;
    if (kcal !== targets.kcal + kcalDelta) {
      ruleIds.push("TGT-04");
      reasons.push(`Your target stays at ${kcal} kcal/day, the minimum we recommend for safety.`);
    }
    kcalDelta = kcal - targets.kcal;
    next = { ...next, kcal, carbsG: Math.max(0, targets.carbsG + Math.round(kcalDelta / 4)) };
  }

  // Hunger ≥ 4: move 5% of calories from carbs to protein and favour high-fiber recipes.
  state.favorHighFiber = checkIn.hunger >= 4;
  if (checkIn.hunger >= 4) {
    const grams = Math.min(next.carbsG, Math.round((0.05 * next.kcal) / 4));
    next = { ...next, carbsG: next.carbsG - grams, proteinG: next.proteinG + grams };
    ruleIds.push("AGT-HUNGER");
    reasons.push(`You rated hunger ${checkIn.hunger}/5, so we moved ${grams} g from carbs to protein and will pick more high-fiber meals. Both help you feel full longer.`);
  }

  // Workout difficulty / pain.
  let workoutChange: AdaptationResult["workoutChange"] = "none";
  const setAdjust = state.setAdjust ?? 0;
  if (checkIn.newPain) {
    workoutChange = "regress";
    state.setAdjust = Math.max(-MAX_SET_ADJUST, setAdjust - 1);
    ruleIds.push("AGT-PAIN");
    reasons.push("You reported new pain, so we lightened your workouts and paused the camera coach. Rest, and consult a health professional before training through pain.");
  } else if (checkIn.difficulty === "hard" && state.lastDifficulty === "hard") {
    workoutChange = "regress";
    state.setAdjust = Math.max(-MAX_SET_ADJUST, setAdjust - 1);
    ruleIds.push("AGT-WORKOUT-REGRESS");
    reasons.push("Workouts felt hard two check-ins in a row, so each exercise drops one set this week.");
  } else if (
    checkIn.difficulty === "easy" &&
    state.lastDifficulty === "easy" &&
    (input.goodFormShare == null || input.goodFormShare >= 0.8)
  ) {
    workoutChange = "progress";
    state.setAdjust = Math.min(MAX_SET_ADJUST, setAdjust + 1);
    ruleIds.push("AGT-WORKOUT-PROGRESS");
    reasons.push(
      input.goodFormShare == null
        ? "Workouts felt easy two check-ins in a row, so each exercise gets one more set."
        : `Workouts felt easy two check-ins in a row and ${Math.round(input.goodFormShare * 100)}% of your reps had good form, so each exercise gets one more set.`,
    );
  } else if (checkIn.difficulty === "easy" && state.lastDifficulty === "easy") {
    ruleIds.push("AGT-WORKOUT-FORM-FIRST");
    reasons.push("Workouts feel easy, but let's lock in your form first before adding volume.");
  }
  state.lastDifficulty = checkIn.difficulty;
  state.posePaused = checkIn.newPain;

  if (checkIn.adherence <= 2) tips.push("Rough week? Pick one small habit, like logging breakfast, and build from there.");
  if (checkIn.energy <= 2 && kcalDelta <= 0) tips.push("Low energy can come from too little food or sleep. Make sure you eat your planned snack.");

  const targetsChanged =
    next.kcal !== targets.kcal || next.proteinG !== targets.proteinG || next.carbsG !== targets.carbsG || next.fatG !== targets.fatG;
  if (!targetsChanged && !ruleIds.includes("AGT-ADHERENCE")) ruleIds.push("AGT-NO-CHANGE");

  return {
    ruleIds: [...new Set(ruleIds)],
    reasons,
    trend,
    kcalDelta,
    targets: next,
    targetsChanged,
    workoutChange,
    favorHighFiber: state.favorHighFiber,
    posePaused: state.posePaused,
    tips,
    state,
  };
}

/** AGENT-02: a check-in is due 7 days after the last one (or after onboarding). */
export function checkInDue(lastCheckIn: string | null, onboardedOn: string | null, today: string): boolean {
  const since = lastCheckIn ?? onboardedOn;
  if (!since) return false;
  return dayIndex(today) - dayIndex(since) >= 7;
}
