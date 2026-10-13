import { describe, expect, it } from "vitest";
import catalog from "../../../supabase/seed/exercises.json";
import { cosine } from "./vectors";
import { eligible, recommendWorkoutPlan, type CatalogExercise, type WorkoutProfile } from "./workout-recommender";

const CAT = catalog as CatalogExercise[];
const byslug = (s: string) => CAT.find((e) => e.slug === s)!;
const base: WorkoutProfile = { goal: "lose", experience: "beginner", equipment: ["none"], daysPerWeek: 3, minutesPerSession: 30 };

describe("cosine", () => {
  it("is 1 for identical direction and 0 for disjoint vectors", () => {
    expect(cosine({ a: 1, b: 2 }, { a: 2, b: 4 })).toBeCloseTo(1);
    expect(cosine({ a: 1 }, { b: 1 })).toBe(0);
    expect(cosine({}, { b: 1 })).toBe(0);
  });
});

describe("recommendWorkoutPlan (WORK-01)", () => {
  it("builds one session per training day, each within the time budget", () => {
    const plan = recommendWorkoutPlan(base, CAT);
    expect(plan.days).toHaveLength(3);
    expect(plan.days.map((d) => d.dayOffset)).toEqual([0, 2, 4]);
    for (const d of plan.days) {
      expect(d.items.length).toBeGreaterThanOrEqual(3);
      expect(d.estMinutes).toBeLessThanOrEqual(30);
    }
  });

  it("only uses owned equipment, beginner difficulty, and no excluded joints", () => {
    const plan = recommendWorkoutPlan({ ...base, avoid: ["wrist"] }, CAT);
    for (const item of plan.days.flatMap((d) => d.items)) {
      const e = byslug(item.slug);
      expect(e.equipment).toContain("none");
      expect(e.difficulty).toBe(1);
      expect(e.contraindications).not.toContain("wrist");
    }
  });

  it("includes a camera-coached move in at least 2 sessions (PRD §7.6)", () => {
    for (const p of [base, { ...base, experience: "intermediate" as const, daysPerWeek: 4 }]) {
      const plan = recommendWorkoutPlan(p, CAT);
      const withPose = plan.days.filter((d) => d.items.some((i) => byslug(i.slug).pose_supported));
      expect(withPose.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses dumbbells when available and an upper/lower split for 4 days", () => {
    const plan = recommendWorkoutPlan({ ...base, experience: "intermediate", equipment: ["dumbbells"], daysPerWeek: 4, minutesPerSession: 45 }, CAT);
    expect(plan.split).toBe("upper_lower");
    expect(plan.days.flatMap((d) => d.items).some((i) => i.slug.startsWith("db-"))).toBe(true);
  });

  it("keeps flagged / pregnant users on low-impact beginner moves", () => {
    const plan = recommendWorkoutPlan({ ...base, experience: "intermediate", beginnerCap: true, lowImpactOnly: true }, CAT);
    for (const i of plan.days.flatMap((d) => d.items)) {
      expect(byslug(i.slug).impact).toBe("low");
      expect(byslug(i.slug).difficulty).toBe(1);
    }
    expect(plan.ruleIds).toContain("ONB-04");
  });

  it("adds conditioning for weight loss but not for gain", () => {
    const cardio = (g: "lose" | "gain") =>
      recommendWorkoutPlan({ ...base, goal: g, minutesPerSession: 60 }, CAT).days.flatMap((d) => d.items).filter((i) => byslug(i.slug).muscle_groups.includes("cardio")).length;
    expect(cardio("lose")).toBeGreaterThan(0);
    expect(cardio("gain")).toBe(0);
  });

  it("filters by eligibility rules", () => {
    expect(eligible(byslug("jump-squat"), { ...base, experience: "intermediate" })).toBe(false); // difficulty 3
    expect(eligible(byslug("db-row"), base)).toBe(false); // needs dumbbells
    expect(eligible(byslug("squat"), { ...base, avoid: ["knee"] })).toBe(false);
  });
});

describe("check-in set adjustment (AGENT-03)", () => {
  const setsOf = (p: WorkoutProfile) =>
    recommendWorkoutPlan(p, CAT).days.flatMap((d) => d.items).filter((i) => !i.slug.startsWith("stretch")).map((i) => i.sets);
  it("adds or removes sets, clamped to 1…5", () => {
    const first = (p: WorkoutProfile) => recommendWorkoutPlan(p, CAT).days[0]!.items[0]!.sets;
    expect(first({ ...base, setAdjust: 1 })).toBe(first(base) + 1);
    expect(first({ ...base, setAdjust: -1 })).toBe(Math.max(1, first(base) - 1));
    expect(setsOf({ ...base, setAdjust: -5 }).every((s) => s >= 1)).toBe(true);
    expect(recommendWorkoutPlan({ ...base, setAdjust: -1 }, CAT).ruleIds).toContain("AGT-WORKOUT-REGRESS");
  });
});
