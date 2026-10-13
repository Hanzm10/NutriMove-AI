import { describe, expect, it } from "vitest";
import catalog from "../../../supabase/seed/exercises.json";
import recipes from "../../../supabase/seed/recipes.json";
import { adaptPlan, type AdaptState, type CheckInAnswers, type WeightPoint } from "./adaptation";
import { screen, type ScreeningInput } from "./guardrails";
import { PLAN_SLOTS, eligibleRecipe, recommendMealPlan, type CatalogRecipe, type MealProfile } from "./meal-recommender";
import { CALORIE_FLOOR, KCAL_PER_KG, computeTargets, type TargetInput } from "./targets";
import type { ActivityLevel, Goal, Sex } from "./types";
import { recommendWorkoutPlan, type CatalogExercise } from "./workout-recommender";

// PRD §8.3 guardrails as end-to-end scenarios (PRD §13 Day 6): each one runs whole profiles through the pure
// pipeline and asserts the safety invariant, not a single function's output.

const RECIPES = recipes as CatalogRecipe[];
const EXERCISES = catalog as CatalogExercise[];
const TODAY = "2026-10-26";

const healthy: ScreeningInput = { ageYears: 30, pregnantOrBreastfeeding: false, parq: {} };
const flat = (kg: number, days = 14): WeightPoint[] =>
  Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.parse(`${TODAY}T00:00:00Z`) - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    kg,
  }));
const answers = (over: Partial<CheckInAnswers> = {}): CheckInAnswers => ({ weightKg: 70, adherence: 4, hunger: 3, energy: 3, difficulty: "right", newPain: false, ...over });

const SEXES: Sex[] = ["female", "male"];
const ACTIVITIES: ActivityLevel[] = ["sedentary", "light", "moderate", "active", "very_active"];
const GOALS: Goal[] = ["lose", "maintain", "gain"];
const BODIES = [
  { ageYears: 18, heightCm: 145, weightKg: 38 }, // smallest plausible adult
  { ageYears: 25, heightCm: 158, weightKg: 52 },
  { ageYears: 40, heightCm: 172, weightKg: 80 },
  { ageYears: 55, heightCm: 165, weightKg: 120 },
  { ageYears: 70, heightCm: 180, weightKg: 95 },
];

describe("age gate (ONB-02)", () => {
  it("blocks every age under 18, including nonsense values", () => {
    for (const age of [-1, 0, 5, 12, 17, Number.NaN]) {
      const r = screen({ ...healthy, ageYears: age });
      expect(r.status).toBe("blocked");
      expect(r.ruleIds).toContain("ONB-02");
    }
    expect(screen({ ...healthy, ageYears: 18 }).status).toBe("ok");
  });
});

describe("calorie floor and 1%/week cap hold for every profile (TGT-04/05)", () => {
  const cases: TargetInput[] = [];
  for (const sex of SEXES) for (const b of BODIES) for (const activity of ACTIVITIES) for (const goal of GOALS) {
    cases.push({ sex, activity, goal, ...b });
  }

  it(`${cases.length} profiles: never below the floor, never losing faster than 1% of body weight a week`, () => {
    for (const input of cases) {
      const t = computeTargets(input);
      expect(t.kcal, JSON.stringify(input)).toBeGreaterThanOrEqual(CALORIE_FLOOR[input.sex]);
      if (t.effectiveGoal === "lose") {
        const weeklyLossKg = ((t.tdee - t.kcal) * 7) / KCAL_PER_KG;
        // the floor can only shrink the deficit, so the cap holds (±0.1 kg for rounding of tdee/kcal)
        expect(weeklyLossKg, JSON.stringify(input)).toBeLessThanOrEqual(input.weightKg * 0.01 + 0.1);
      }
      expect(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9, JSON.stringify(input)).toBeGreaterThan(0);
      expect(t.carbsG).toBeGreaterThanOrEqual(0);
      expect(t.reasons.length).toBeGreaterThan(0);
    }
  });

  it("flagged users (health screening) are never given less than their BMR", () => {
    for (const sex of SEXES) for (const b of BODIES) {
      const t = computeTargets({ sex, activity: "sedentary", goal: "lose", screeningFlagged: true, ...b });
      expect(t.kcal).toBeGreaterThanOrEqual(t.bmr - 5);
    }
  });
});

describe("pregnancy / breastfeeding forces maintenance everywhere (ONB-03)", () => {
  const s = screen({ ...healthy, pregnantOrBreastfeeding: true });
  it("screening → maintenance, beginner, low impact", () => {
    expect(s).toMatchObject({ status: "flagged", maintenanceOnly: true, beginnerCap: true, lowImpactOnly: true });
  });

  it("targets ignore a 'lose' goal", () => {
    for (const b of BODIES) {
      const lose = computeTargets({ sex: "female", activity: "moderate", goal: "lose", maintenanceOnly: s.maintenanceOnly, ...b });
      const keep = computeTargets({ sex: "female", activity: "moderate", goal: "maintain", ...b });
      expect(lose.kcal).toBe(keep.kcal);
      expect(lose.effectiveGoal).toBe("maintain");
    }
  });

  it("the weekly check-in never cuts calories either, even after many flat weeks (regression: the engine ignored this)", () => {
    let state: AdaptState = { slowLossStreak: 5 };
    let targets = { kcal: 1900, proteinG: 80, carbsG: 250, fatG: 55 };
    for (let week = 0; week < 8; week++) {
      const r = adaptPlan({
        goal: "lose", maintenanceOnly: true, today: TODAY, targets, floorKcal: 1500, weights: flat(70),
        avgIntakeKcal: targets.kcal, loggedDays: 6, goodFormShare: 0.9, checkIn: answers(), state,
      });
      expect(r.kcalDelta).toBe(0);
      expect(r.targets.kcal).toBe(1900);
      expect(r.ruleIds).toContain("ONB-03");
      state = r.state;
      targets = r.targets;
    }
  });

  it("workouts stay beginner-level and low impact", () => {
    const plan = recommendWorkoutPlan(
      { goal: "maintain", experience: "intermediate", equipment: ["none"], daysPerWeek: 5, minutesPerSession: 45, beginnerCap: s.beginnerCap, lowImpactOnly: s.lowImpactOnly },
      EXERCISES,
    );
    const bySlug = new Map(EXERCISES.map((e) => [e.slug, e]));
    for (const it of plan.days.flatMap((d) => d.items)) {
      const e = bySlug.get(it.slug)!;
      expect(e.impact, e.slug).not.toBe("high");
      expect(e.difficulty, e.slug).toBeLessThanOrEqual(1);
    }
  });
});

describe("health screening flag (ONB-04)", () => {
  it("any PAR-Q yes → flagged, beginner cap, clearance acknowledgement required", () => {
    for (const id of ["heart_condition", "chest_pain", "dizziness", "chronic_condition", "medication", "bone_joint", "supervised_only"] as const) {
      const r = screen({ ...healthy, parq: { [id]: true } });
      expect(r, id).toMatchObject({ status: "flagged", beginnerCap: true, requiresClearanceAck: true });
    }
    expect(screen({ ...healthy, parq: { heart_condition: false } }).status).toBe("ok");
  });
});

describe("the weekly loop can't walk calories below the floor (TGT-04) or above the safe loss rate", () => {
  it("20 weeks of flat weight on a 'lose' goal bottoms out at the floor, never below", () => {
    let state: AdaptState = {};
    let targets = { kcal: 1800, proteinG: 110, carbsG: 190, fatG: 50 };
    for (let week = 0; week < 20; week++) {
      const r = adaptPlan({
        goal: "lose", today: TODAY, targets, floorKcal: 1500, weights: flat(70),
        avgIntakeKcal: targets.kcal, loggedDays: 7, goodFormShare: null, checkIn: answers(), state,
      });
      expect(r.targets.kcal).toBeGreaterThanOrEqual(1500);
      expect(r.targets.carbsG).toBeGreaterThanOrEqual(0);
      state = r.state;
      targets = r.targets;
    }
    expect(targets.kcal).toBe(1500);
  });

  it("losing faster than 1%/week always adds calories, never removes them", () => {
    for (const pct of [-1.1, -1.5, -3]) {
      const perDay = (70 * pct) / 100 / 7;
      const weights = flat(70).map((w, i) => ({ ...w, kg: 70 + perDay * i }));
      const r = adaptPlan({
        goal: "lose", today: TODAY, targets: { kcal: 1600, proteinG: 110, carbsG: 150, fatG: 45 }, floorKcal: 1500,
        weights, avgIntakeKcal: 1600, loggedDays: 7, goodFormShare: null, checkIn: answers(), state: {},
      });
      expect(r.kcalDelta, `${pct}%/wk`).toBeGreaterThan(0);
    }
  });

  it("flagged users keep a floor at their BMR through the loop", () => {
    const r = adaptPlan({
      goal: "lose", today: TODAY, targets: { kcal: 1620, proteinG: 100, carbsG: 160, fatG: 45 }, floorKcal: 1600, weights: flat(70),
      avgIntakeKcal: 1620, loggedDays: 7, goodFormShare: null, checkIn: answers(), state: { slowLossStreak: 1 },
    });
    expect(r.targets.kcal).toBeGreaterThanOrEqual(1600);
  });
});

describe("new pain pauses coached training and lightens the plan (PRD §8.3)", () => {
  it("sets posePaused, regresses workouts, keeps it paused until cleared, and the next plan is low-impact", () => {
    const r = adaptPlan({
      goal: "maintain", today: TODAY, targets: { kcal: 2000, proteinG: 100, carbsG: 250, fatG: 60 }, floorKcal: 1500, weights: flat(70),
      avgIntakeKcal: 2000, loggedDays: 7, goodFormShare: 0.95, checkIn: answers({ newPain: true, difficulty: "easy" }), state: { lastDifficulty: "easy" },
    });
    expect(r.posePaused).toBe(true);
    expect(r.workoutChange).toBe("regress"); // not "progress", even though workouts felt easy twice
    expect(r.state.setAdjust).toBeLessThan(0);
    const plan = recommendWorkoutPlan(
      { goal: "maintain", experience: "intermediate", equipment: ["none"], daysPerWeek: 4, minutesPerSession: 30, lowImpactOnly: r.posePaused, setAdjust: r.state.setAdjust },
      EXERCISES,
    );
    const bySlug = new Map(EXERCISES.map((e) => [e.slug, e]));
    expect(plan.days.flatMap((d) => d.items).every((i) => bySlug.get(i.slug)!.impact !== "high")).toBe(true);
  });
});

describe("meal plans never violate allergies, diet or dislikes (MEAL-01)", () => {
  const ALLERGENS = ["peanut", "shellfish", "fish", "egg", "milk", "soy", "wheat"];
  const DIETS = ["omnivore", "pescatarian", "vegetarian"] as const;
  const base: Omit<MealProfile, "dietPattern" | "allergies"> = { kcal: 1800, proteinG: 100, carbsG: 220, fatG: 55, dislikes: [], budget: "low", filipinoFirst: true };

  const combos: string[][] = [[], ...ALLERGENS.map((a) => [a])];
  for (let i = 0; i < ALLERGENS.length; i++) for (let j = i + 1; j < ALLERGENS.length; j++) combos.push([ALLERGENS[i]!, ALLERGENS[j]!]);
  combos.push(["peanut", "shellfish", "egg", "milk", "soy", "wheat", "fish"]);

  const outcomes: { diet: string; allergies: string[]; result: "ok" | "no-recipes" }[] = [];
  it(`${combos.length * DIETS.length} diet × allergy combinations: a plan with no violations, or a clear "no recipes" outcome`, () => {
    for (const dietPattern of DIETS) for (const allergies of combos) {
      const p: MealProfile = { ...base, dietPattern, allergies };
      let plan;
      try {
        plan = recommendMealPlan(p, RECIPES);
      } catch (e) {
        expect((e as Error).message).toMatch(/No eligible recipes for/);
        outcomes.push({ diet: dietPattern, allergies, result: "no-recipes" });
        continue;
      }
      outcomes.push({ diet: dietPattern, allergies, result: "ok" });
      const bySlug = new Map(RECIPES.map((r) => [r.slug, r]));
      for (const m of plan.days.flatMap((d) => d.meals)) {
        const r = bySlug.get(m.slug)!;
        expect(eligibleRecipe(r, p, m.slot), `${dietPattern} ${allergies.join("+")} ${m.slug}`).toBe(true);
        expect(r.allergens.filter((a) => allergies.includes(a))).toEqual([]);
      }
    }
  });

  it("every realistic combination (up to two allergens) still gets a full plan: the catalogue has enough variety", () => {
    const failures = outcomes.filter((o) => o.result === "no-recipes" && o.allergies.length <= 2);
    expect(failures, JSON.stringify(failures)).toEqual([]);
  });

  it("every slot has several recipes left for a vegetarian with the two most common restrictions (egg + wheat; soy + peanut)", () => {
    for (const allergies of [["egg", "wheat"], ["soy", "peanut"], ["milk", "egg"]]) {
      for (const slot of PLAN_SLOTS) {
        const n = RECIPES.filter((r) => eligibleRecipe(r, { ...base, dietPattern: "vegetarian", allergies }, slot)).length;
        expect(n, `${allergies.join("+")} ${slot}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
