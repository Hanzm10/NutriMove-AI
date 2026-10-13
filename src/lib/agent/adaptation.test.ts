import { describe, expect, it } from "vitest";
import { adaptPlan, checkInDue, weightTrend, type AdaptationInput, type WeightPoint } from "./adaptation";

const TODAY = "2026-10-26";
/** Daily weights over the last `days` days changing linearly by `pctPerWeek` (negative = loss). */
function series(startKg: number, pctPerWeek: number, days = 14): WeightPoint[] {
  const perDay = (startKg * pctPerWeek) / 100 / 7;
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.parse(`${TODAY}T00:00:00Z`) - (days - 1 - i) * 86_400_000);
    return { date: d.toISOString().slice(0, 10), kg: Math.round((startKg + perDay * i) * 100) / 100 };
  });
}

const base: AdaptationInput = {
  goal: "lose",
  today: TODAY,
  targets: { kcal: 1800, proteinG: 112, carbsG: 200, fatG: 50 },
  floorKcal: 1500,
  weights: series(70, -0.5),
  avgIntakeKcal: 1790,
  loggedDays: 6,
  goodFormShare: 0.9,
  checkIn: { weightKg: 69.5, adherence: 4, hunger: 3, energy: 3, difficulty: "right", newPain: false },
  state: {},
};

describe("weightTrend (Appendix A)", () => {
  it("recovers the slope of a linear series as %/week", () => {
    const t = weightTrend(series(80, -0.8), TODAY)!;
    expect(t.pctPerWeek).toBeCloseTo(-0.8, 1);
    expect(t.points).toBe(14);
  });
  it("needs ≥ 2 weigh-ins about a week apart and ignores data older than 14 days", () => {
    expect(weightTrend([{ date: TODAY, kg: 70 }], TODAY)).toBeNull();
    expect(weightTrend([{ date: "2026-10-24", kg: 70 }, { date: TODAY, kg: 69 }], TODAY)).toBeNull();
    expect(weightTrend([{ date: "2026-09-01", kg: 90 }, { date: "2026-10-19", kg: 70 }, { date: TODAY, kg: 70 }], TODAY)!.pctPerWeek).toBe(0);
  });
});

describe("adaptPlan (AGENT-03 scenarios)", () => {
  it("1. lose goal, steady safe loss → no calorie change", () => {
    const r = adaptPlan(base);
    expect(r.kcalDelta).toBe(0);
    expect(r.targetsChanged).toBe(false);
    expect(r.ruleIds).toContain("AGT-ON-TRACK");
  });

  it("2. lose goal, flat for the first check-in → wait, streak counted", () => {
    const r = adaptPlan({ ...base, weights: series(70, -0.1) });
    expect(r.kcalDelta).toBe(0);
    expect(r.state.slowLossStreak).toBe(1);
    expect(r.ruleIds).toContain("AGT-LOSE-WAIT");
  });

  it("3. lose goal, flat for 2 check-ins with intake on target → −150 kcal from carbs", () => {
    const r = adaptPlan({ ...base, weights: series(70, -0.1), state: { slowLossStreak: 1 } });
    expect(r.kcalDelta).toBe(-150);
    expect(r.targets.kcal).toBe(1650);
    expect(r.targets.carbsG).toBe(200 + Math.round(-150 / 4));
    expect(r.targets.proteinG).toBe(112);
    expect(r.state.slowLossStreak).toBe(0);
    expect(r.ruleIds).toContain("AGT-LOSE-SLOW");
  });

  it("4. lose goal, flat for 2 check-ins but too few food logs → no cut", () => {
    const r = adaptPlan({ ...base, weights: series(70, -0.1), state: { slowLossStreak: 1 }, loggedDays: 1 });
    expect(r.kcalDelta).toBe(0);
    expect(r.reasons.join(" ")).toMatch(/Log your meals/);
  });

  it("5. the −150 never goes below the calorie floor", () => {
    const r = adaptPlan({
      ...base, targets: { kcal: 1550, proteinG: 112, carbsG: 150, fatG: 45 }, avgIntakeKcal: 1550,
      weights: series(70, 0), state: { slowLossStreak: 1 },
    });
    expect(r.targets.kcal).toBe(1500);
    expect(r.kcalDelta).toBe(-50);
    expect(r.ruleIds).toContain("TGT-04");
  });

  it("6. lose goal, losing > 1%/week → +150 kcal", () => {
    const r = adaptPlan({ ...base, weights: series(70, -1.4) });
    expect(r.kcalDelta).toBe(150);
    expect(r.ruleIds).toContain("AGT-LOSE-FAST");
  });

  it("7. logged intake > 20% off target → targets unchanged, adherence tip", () => {
    const r = adaptPlan({ ...base, weights: series(70, 0.3), avgIntakeKcal: 2400 });
    expect(r.targetsChanged).toBe(false);
    expect(r.ruleIds).toContain("AGT-ADHERENCE");
    expect(r.tips.length).toBeGreaterThan(0);
  });

  it("8. gain goal: too slow → +150, too fast → −100", () => {
    const slow = adaptPlan({ ...base, goal: "gain", weights: series(60, 0.05), targets: { kcal: 2600, proteinG: 96, carbsG: 360, fatG: 72 }, avgIntakeKcal: 2550 });
    expect(slow.kcalDelta).toBe(150);
    const fast = adaptPlan({ ...base, goal: "gain", weights: series(60, 0.8), targets: { kcal: 2600, proteinG: 96, carbsG: 360, fatG: 72 }, avgIntakeKcal: 2600 });
    expect(fast.kcalDelta).toBe(-100);
    expect(fast.ruleIds).toContain("AGT-GAIN-FAST");
  });

  it("9. hunger ≥ 4 → 5% of kcal moves from carbs to protein, high-fiber flag", () => {
    const r = adaptPlan({ ...base, checkIn: { ...base.checkIn, hunger: 4 } });
    const grams = Math.round((0.05 * 1800) / 4);
    expect(r.targets.proteinG).toBe(112 + grams);
    expect(r.targets.carbsG).toBe(200 - grams);
    expect(r.targets.kcal).toBe(1800);
    expect(r.favorHighFiber).toBe(true);
    expect(r.ruleIds).toContain("AGT-HUNGER");
  });

  it("10. workout hard twice in a row → regress one set", () => {
    const r = adaptPlan({ ...base, checkIn: { ...base.checkIn, difficulty: "hard" }, state: { lastDifficulty: "hard" } });
    expect(r.workoutChange).toBe("regress");
    expect(r.state.setAdjust).toBe(-1);
  });

  it("11. easy twice with good form → progress; with poor form → hold", () => {
    const easy = { ...base, checkIn: { ...base.checkIn, difficulty: "easy" as const }, state: { lastDifficulty: "easy" as const } };
    expect(adaptPlan(easy).workoutChange).toBe("progress");
    expect(adaptPlan(easy).state.setAdjust).toBe(1);
    const poor = adaptPlan({ ...easy, goodFormShare: 0.6 });
    expect(poor.workoutChange).toBe("none");
    expect(poor.ruleIds).toContain("AGT-WORKOUT-FORM-FIRST");
  });

  it("12. new pain → regress, camera coach paused, banner reason", () => {
    const r = adaptPlan({ ...base, checkIn: { ...base.checkIn, newPain: true } });
    expect(r.workoutChange).toBe("regress");
    expect(r.posePaused).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/consult/);
  });

  it("13. set adjustment is capped at ±2", () => {
    const r = adaptPlan({ ...base, checkIn: { ...base.checkIn, difficulty: "hard" }, state: { lastDifficulty: "hard", setAdjust: -2 } });
    expect(r.state.setAdjust).toBe(-2);
  });

  it("14. no trend yet → nothing changes, explains why", () => {
    const r = adaptPlan({ ...base, weights: [{ date: TODAY, kg: 70 }] });
    expect(r.kcalDelta).toBe(0);
    expect(r.ruleIds).toContain("AGT-NO-TREND");
  });

  it("every result explains itself (AGENT-01) and is deterministic", () => {
    const r = adaptPlan(base);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.ruleIds.length).toBeGreaterThan(0);
    expect(adaptPlan(base)).toEqual(r);
  });
});

describe("checkInDue (AGENT-02)", () => {
  it("is due 7 days after the last check-in, or after onboarding when there is none", () => {
    expect(checkInDue("2026-10-19", "2026-10-01", TODAY)).toBe(true);
    expect(checkInDue("2026-10-20", "2026-10-01", TODAY)).toBe(false);
    expect(checkInDue(null, "2026-10-19", TODAY)).toBe(true);
    expect(checkInDue(null, null, TODAY)).toBe(false);
  });
});
