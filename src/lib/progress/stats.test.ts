import { describe, expect, it } from "vitest";
import { longestStreak, summarize, type DayInput } from "./stats";

const TODAY = "2026-10-20";
const day = (date: string, over: Partial<DayInput> = {}): DayInput => ({
  date, kcal: 0, proteinG: 0, targetKcal: 1800, targetProteinG: 100, activeMin: 0,
  workoutDone: false, workoutPlanned: false, repsCounted: 0, repsGood: 0, water: 0, logged: false, ...over,
});
const dates = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));

describe("progress stats (DASH-02)", () => {
  it("longestStreak counts consecutive days", () => {
    expect(longestStreak([true, true, false, true, true, true])).toBe(3);
    expect(longestStreak([])).toBe(0);
  });

  it("7d: daily buckets, consistency, calorie days within ±10% and good-form %", () => {
    const ds = dates(7).map((d, i) => day(d, {
      logged: i >= 2, kcal: i >= 2 ? (i % 2 ? 1750 : 2100) : 0, // 1750 within, 2100 outside
      workoutPlanned: i % 2 === 0, workoutDone: i === 0 || i === 4, activeMin: i === 0 ? 20 : i === 4 ? 25 : 0,
      repsCounted: i === 4 ? 40 : 0, repsGood: i === 4 ? 30 : 0,
    }));
    const s = summarize("7d", TODAY, ds, [{ date: dates(7)[1]!, kg: 70 }, { date: TODAY, kg: 69.4 }], { goodRepsAllTime: 30, checkIns: 0 });
    expect(s.buckets).toHaveLength(7);
    expect(s.consistency).toEqual({ done: 2, planned: 4 });
    expect(s.activeMin).toBe(45);
    expect(s.calorieDays).toEqual({ within: 2, logged: 5, total: 7 });
    expect(s.goodForm.pct).toBe(75);
    expect(s.buckets.at(-1)!.weightKg).toBe(69.4);
    expect(s.buckets[0]!.kcal).toBeNull();
  });

  it("3m: weekly buckets with averages", () => {
    const ds = dates(91).map((d) => day(d, { logged: true, kcal: 1800 }));
    const s = summarize("3m", TODAY, ds, [], { goodRepsAllTime: 0, checkIns: 1 });
    expect(s.buckets).toHaveLength(13);
    expect(s.buckets[0]!.kcal).toBe(1800);
    expect(s.buckets[0]!.withinTarget).toBe(7);
  });

  it("milestones follow simple rules", () => {
    const ds = dates(7).map((d, i) => day(d, { logged: i < 3, proteinG: 95, workoutDone: i === 1, kcal: 1800 }));
    const m = Object.fromEntries(summarize("7d", TODAY, ds, [], { goodRepsAllTime: 120, checkIns: 1 }).milestones.map((x) => [x.id, x.achieved]));
    expect(m).toMatchObject({ "first-workout": true, "log-streak-3": true, "protein-3": true, "calories-5": false, "good-reps-100": true, "first-check-in": true });
  });
});
