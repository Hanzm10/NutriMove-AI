import { describe, expect, it } from "vitest";
import { percentOf, scaleFood, slotForHour, sumSnapshots } from "./nutrition";

const rice = { kcal_100g: 129, protein_100g: 2.4, carbs_100g: 28.6, fat_100g: 0.2, fiber_100g: 0.3 };

describe("nutrition math (FOOD-04/05)", () => {
  it("scales per-100 g values to the logged quantity", () => {
    expect(scaleFood(rice, 160)).toEqual({ kcal: 206.4, protein_g: 3.8, carbs_g: 45.8, fat_g: 0.3, fiber_g: 0.5 });
    expect(scaleFood(rice, 0)).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
  });
  it("accepts numeric strings from Postgres numeric columns", () => {
    expect(scaleFood({ kcal_100g: "100" as unknown as number, protein_100g: 0, carbs_100g: 0, fat_100g: 0, fiber_100g: 0 }, 50).kcal).toBe(50);
  });
  it("sums a day of logs", () => {
    expect(sumSnapshots([scaleFood(rice, 160), { kcal: 300, protein_g: 25 }])).toEqual({
      kcal: 506, protein_g: 28.8, carbs_g: 45.8, fat_g: 0.3, fiber_g: 0.5,
    });
  });
  it("picks a meal slot by time of day", () => {
    expect([7, 12, 16, 19, 23].map(slotForHour)).toEqual(["breakfast", "lunch", "snack", "dinner", "snack"]);
  });
  it("clamps percentages", () => {
    expect(percentOf(500, 2000)).toBe(25);
    expect(percentOf(2500, 2000)).toBe(100);
    expect(percentOf(10, 0)).toBe(0);
  });
});
