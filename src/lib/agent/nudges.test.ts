import { describe, expect, it } from "vitest";
import { dailyNudge, type NudgeInput } from "./nudges";

const base: NudgeInput = {
  hour: 13, targets: { kcal: 2000, protein_g: 100 }, totals: { kcal: 900, protein_g: 45 },
  workoutPlannedToday: true, workoutDoneToday: false, water: 4, waterGoal: 8,
};

describe("dailyNudge (AGENT-05)", () => {
  it("is on track when everything paces well", () => {
    expect(dailyNudge(base).ruleIds).toContain("NUDGE-OK");
  });
  it("suggests a protein snack when protein lags", () => {
    expect(dailyNudge({ ...base, totals: { kcal: 900, protein_g: 10 } }).ruleIds).toContain("NUDGE-PROTEIN");
  });
  it("prioritises being over target", () => {
    expect(dailyNudge({ ...base, totals: { kcal: 2300, protein_g: 10 } }).ruleIds).toContain("NUDGE-OVER");
  });
  it("reminds about a planned workout in the afternoon", () => {
    expect(dailyNudge({ ...base, hour: 17, totals: { kcal: 1400, protein_g: 70 }, water: 7 }).ruleIds).toContain("NUDGE-WORKOUT");
    expect(dailyNudge({ ...base, hour: 17, workoutDoneToday: true, totals: { kcal: 1400, protein_g: 70 }, water: 7 }).ruleIds).toContain("NUDGE-OK");
  });
  it("flags low water", () => {
    expect(dailyNudge({ ...base, hour: 18, workoutPlannedToday: false, totals: { kcal: 1500, protein_g: 80 }, water: 1 }).ruleIds).toContain("NUDGE-WATER");
  });
  it("asks for setup without targets", () => {
    expect(dailyNudge({ ...base, targets: null }).action?.href).toBe("/onboarding");
  });
});
