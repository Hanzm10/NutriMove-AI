// Pure nutrition math (FOOD-04/05). Values in foods are per 100 g; logs store a snapshot.

export type Per100g = {
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number;
};

export type Snapshot = { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Nutrients for `grams` of a food (rounded to 0.1). */
export function scaleFood(food: Per100g, grams: number): Snapshot {
  const k = grams / 100;
  return {
    kcal: r1(Number(food.kcal_100g) * k),
    protein_g: r1(Number(food.protein_100g) * k),
    carbs_g: r1(Number(food.carbs_100g) * k),
    fat_g: r1(Number(food.fat_100g) * k),
    fiber_g: r1(Number(food.fiber_100g) * k),
  };
}

export function sumSnapshots(items: Partial<Snapshot>[]): Snapshot {
  const t = items.reduce<Snapshot>(
    (acc, i) => ({
      kcal: acc.kcal + Number(i.kcal ?? 0),
      protein_g: acc.protein_g + Number(i.protein_g ?? 0),
      carbs_g: acc.carbs_g + Number(i.carbs_g ?? 0),
      fat_g: acc.fat_g + Number(i.fat_g ?? 0),
      fiber_g: acc.fiber_g + Number(i.fiber_g ?? 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  );
  return { kcal: Math.round(t.kcal), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g), fiber_g: r1(t.fiber_g) };
}

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** Default meal slot from the local hour (Asia/Manila). */
export function slotForHour(hour: number): MealSlot {
  if (hour >= 4 && hour < 10) return "breakfast";
  if (hour >= 10 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 22) return "dinner";
  return "snack";
}

/** Share of a target reached, clamped to 0–100 for rings and bars. */
export function percentOf(value: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}
