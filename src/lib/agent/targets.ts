import type { ActivityLevel, Explanation, Goal, Sex } from "./types";

/** PRD TGT-02 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** PRD TGT-04 */
export const CALORIE_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };

export const KCAL_PER_KG = 7700;
const LOSE_DEFICIT = 500;
const MAX_DEFICIT_SHARE = 0.25;
const GAIN_SURPLUS = 300;
const MAX_WEEKLY_LOSS_SHARE = 0.01; // TGT-05: ≤ 1% body weight per week
const FAT_SHARE = 0.25;
const MIN_FAT_G_PER_KG = 0.6;
const FIBER_G = 25;

export type TargetInput = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  /** From screening: pregnancy/breastfeeding forces maintenance (ONB-03). */
  maintenanceOnly?: boolean;
  /** From screening: flagged users never go below BMR (TGT-04). */
  screeningFlagged?: boolean;
  targetWeightKg?: number | null;
};

export type Targets = Explanation & {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  effectiveGoal: Goal;
  /** Expected change in kg/week (negative = loss). */
  expectedWeeklyChangeKg: number;
  /** Rough range to reach targetWeightKg, in weeks (TGT-07). Null when not applicable. */
  timelineWeeks: [number, number] | null;
};

/** TGT-01: Mifflin-St Jeor resting energy expenditure (kcal/day). */
export function mifflinStJeor(sex: Sex, weightKg: number, heightCm: number, ageYears: number) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === "male" ? base + 5 : base - 161;
}

export function computeTargets(input: TargetInput): Targets {
  const ruleIds: string[] = ["TGT-01", "TGT-02"];
  const reasons: string[] = [];

  const bmrRaw = mifflinStJeor(input.sex, input.weightKg, input.heightCm, input.ageYears);
  const tdeeRaw = bmrRaw * ACTIVITY_FACTORS[input.activity];
  const bmr = Math.round(bmrRaw);
  const tdee = Math.round(tdeeRaw);
  reasons.push(
    `Your body uses about ${bmr} kcal/day at rest and about ${tdee} kcal/day with your activity level.`,
  );

  let effectiveGoal = input.goal;
  if (input.maintenanceOnly && input.goal !== "maintain") {
    effectiveGoal = "maintain";
    ruleIds.push("ONB-03");
    reasons.push("Your target is set to maintenance because of your screening answers.");
  }

  // TGT-03 goal adjustment
  let kcal = tdeeRaw;
  if (effectiveGoal === "lose") {
    let deficit = Math.min(LOSE_DEFICIT, MAX_DEFICIT_SHARE * tdeeRaw);
    // TGT-05: cap expected loss at 1% of body weight per week.
    const maxDeficitForCap = (MAX_WEEKLY_LOSS_SHARE * input.weightKg * KCAL_PER_KG) / 7;
    if (deficit > maxDeficitForCap) {
      deficit = maxDeficitForCap;
      ruleIds.push("TGT-05");
      reasons.push("We kept your deficit small so you lose no more than 1% of your weight per week.");
    }
    kcal = tdeeRaw - deficit;
    ruleIds.push("TGT-03");
    reasons.push(`For weight loss we set a deficit of about ${Math.round(deficit)} kcal/day.`);
  } else if (effectiveGoal === "gain") {
    kcal = tdeeRaw + GAIN_SURPLUS;
    ruleIds.push("TGT-03");
    reasons.push(`For weight gain we added ${GAIN_SURPLUS} kcal/day.`);
  } else {
    ruleIds.push("TGT-03");
    reasons.push("Your target matches the energy you use, to maintain your weight.");
  }

  // TGT-04 calorie floor
  const floor = Math.max(CALORIE_FLOOR[input.sex], input.screeningFlagged ? bmrRaw : 0);
  if (kcal < floor) {
    kcal = floor;
    ruleIds.push("TGT-04");
    reasons.push(
      `Your target was raised to ${Math.round(floor)} kcal/day, the minimum we recommend for safety.`,
    );
  }
  kcal = roundTo(kcal, 10);
  if (kcal < floor) kcal = Math.ceil(floor / 10) * 10; // rounding must never undercut the floor

  // TGT-06 macros
  const proteinPerKg = effectiveGoal === "maintain" ? 1.2 : 1.6;
  let proteinG = Math.round(Math.min(proteinPerKg, 2.2) * input.weightKg);
  let fatG = Math.round(Math.max((FAT_SHARE * kcal) / 9, MIN_FAT_G_PER_KG * input.weightKg));
  let carbsG = Math.round((kcal - proteinG * 4 - fatG * 9) / 4);
  if (carbsG < 0) {
    // Very low targets with high body weight: shrink fat to its minimum, then protein.
    fatG = Math.round(MIN_FAT_G_PER_KG * input.weightKg);
    proteinG = Math.max(0, Math.round((kcal - fatG * 9) / 4));
    carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  }
  ruleIds.push("TGT-06");
  reasons.push(
    `Protein is set to ${proteinPerKg} g per kg of body weight to protect muscle; fat is about 25% of calories and carbs fill the rest.`,
  );

  const expectedWeeklyChangeKg = round1(((kcal - tdeeRaw) * 7) / KCAL_PER_KG);

  // TGT-07 timeline as a range, never a promise
  let timelineWeeks: [number, number] | null = null;
  const target = input.targetWeightKg;
  if (target && effectiveGoal !== "maintain" && Math.abs(expectedWeeklyChangeKg) >= 0.05) {
    const toGo = target - input.weightKg;
    const sameDirection = Math.sign(toGo) === Math.sign(expectedWeeklyChangeKg);
    if (sameDirection && Math.abs(toGo) > 0) {
      const weeks = Math.abs(toGo / expectedWeeklyChangeKg);
      timelineWeeks = [Math.max(1, Math.round(weeks * 0.8)), Math.max(1, Math.round(weeks * 1.25))];
      ruleIds.push("TGT-07");
      reasons.push(
        `At this pace you might reach ${target} kg in about ${timelineWeeks[0]}–${timelineWeeks[1]} weeks. Everyone's body responds differently.`,
      );
    }
  }

  return {
    bmr,
    tdee,
    kcal,
    proteinG,
    carbsG,
    fatG,
    fiberG: FIBER_G,
    effectiveGoal,
    expectedWeeklyChangeKg,
    timelineWeeks,
    ruleIds: [...new Set(ruleIds)],
    reasons,
  };
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}
