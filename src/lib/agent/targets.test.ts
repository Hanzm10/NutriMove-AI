import { describe, expect, it } from "vitest";
import { computeTargets, mifflinStJeor } from "./targets";

describe("mifflinStJeor (TGT-01)", () => {
  it("matches the published equation", () => {
    expect(mifflinStJeor("male", 80, 175, 30)).toBeCloseTo(1748.75);
    expect(mifflinStJeor("female", 60, 165, 25)).toBeCloseTo(1345.25);
  });
});

describe("computeTargets", () => {
  it("male, moderate, lose: 500 kcal deficit and macros (TGT-02/03/06)", () => {
    const t = computeTargets({
      sex: "male", ageYears: 30, heightCm: 175, weightKg: 80, activity: "moderate", goal: "lose",
    });
    expect(t.bmr).toBe(1749);
    expect(t.tdee).toBe(2711);
    expect(t.kcal).toBe(2210);
    expect(t.proteinG).toBe(128);
    expect(t.fatG).toBe(61);
    expect(t.carbsG).toBe(287);
    expect(t.expectedWeeklyChangeKg).toBe(-0.5);
    expect(t.ruleIds).toEqual(["TGT-01", "TGT-02", "TGT-03", "TGT-06"]);
    expect(t.reasons.length).toBeGreaterThan(0);
  });

  it("macro calories add up to the target (±10 kcal rounding)", () => {
    const t = computeTargets({
      sex: "female", ageYears: 35, heightCm: 158, weightKg: 62, activity: "light", goal: "maintain",
    });
    expect(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.kcal)).toBeLessThanOrEqual(10);
  });

  it("maintain uses 1.2 g/kg protein and TDEE calories", () => {
    const t = computeTargets({
      sex: "female", ageYears: 35, heightCm: 158, weightKg: 62, activity: "light", goal: "maintain",
    });
    expect(t.proteinG).toBe(Math.round(1.2 * 62));
    expect(t.kcal).toBe(Math.round(t.tdee / 10) * 10);
    expect(t.timelineWeeks).toBeNull();
  });

  it("gain adds 300 kcal", () => {
    const t = computeTargets({
      sex: "male", ageYears: 22, heightCm: 170, weightKg: 58, activity: "active", goal: "gain",
    });
    expect(t.kcal).toBe(Math.round((t.tdee + 300) / 10) * 10);
    expect(t.expectedWeeklyChangeKg).toBeGreaterThan(0);
  });

  it("caps the deficit at 25% of TDEE for small people", () => {
    const t = computeTargets({
      sex: "female", ageYears: 30, heightCm: 160, weightKg: 45, activity: "active", goal: "lose",
    });
    // TDEE ≈ 1964.8 → 25% ≈ 491 kcal, smaller than 500
    expect(t.kcal).toBe(1470);
  });

  it("applies the female calorie floor (TGT-04)", () => {
    const t = computeTargets({
      sex: "female", ageYears: 25, heightCm: 160, weightKg: 50, activity: "sedentary", goal: "lose",
    });
    expect(t.kcal).toBe(1200);
    expect(t.ruleIds).toContain("TGT-04");
  });

  it("applies the male calorie floor (TGT-04)", () => {
    const t = computeTargets({
      sex: "male", ageYears: 70, heightCm: 155, weightKg: 52, activity: "sedentary", goal: "lose",
    });
    expect(t.kcal).toBe(1500);
    expect(t.ruleIds).toContain("TGT-04");
  });

  it("flagged users never go below BMR, even after rounding (TGT-04)", () => {
    const t = computeTargets({
      sex: "female", ageYears: 25, heightCm: 160, weightKg: 50, activity: "sedentary", goal: "lose",
      screeningFlagged: true,
    });
    expect(t.kcal).toBeGreaterThanOrEqual(1214);
    expect(t.kcal).toBe(1220);
  });

  it("caps weekly loss at 1% of body weight (TGT-05)", () => {
    const t = computeTargets({
      sex: "male", ageYears: 18, heightCm: 150, weightKg: 40, activity: "very_active", goal: "lose",
    });
    expect(t.ruleIds).toContain("TGT-05");
    expect(Math.abs(t.expectedWeeklyChangeKg)).toBeLessThanOrEqual(0.4);
  });

  it("pregnancy forces maintenance (ONB-03)", () => {
    const t = computeTargets({
      sex: "female", ageYears: 29, heightCm: 160, weightKg: 65, activity: "light", goal: "lose",
      maintenanceOnly: true,
    });
    expect(t.effectiveGoal).toBe("maintain");
    expect(t.kcal).toBe(Math.round(t.tdee / 10) * 10);
    expect(t.ruleIds).toContain("ONB-03");
  });

  it("gives the timeline as a range, only in the goal's direction (TGT-07)", () => {
    const base = {
      sex: "male" as const, ageYears: 30, heightCm: 175, weightKg: 80, activity: "moderate" as const,
      goal: "lose" as const,
    };
    const t = computeTargets({ ...base, targetWeightKg: 75 });
    expect(t.timelineWeeks).not.toBeNull();
    const [lo, hi] = t.timelineWeeks!;
    expect(lo).toBeLessThan(hi);
    expect(computeTargets({ ...base, targetWeightKg: 85 }).timelineWeeks).toBeNull();
  });
});
