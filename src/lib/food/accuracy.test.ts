// PRD §12.4 dietary calculation accuracy. Reference values are computed here independently of the app's build
// script: BMR / TDEE by hand from Mifflin-St Jeor (1990), meal nutrition straight from the FNRI CSV.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeTargets, mifflinStJeor } from "../agent/targets";
import type { ActivityLevel, Sex } from "../agent/types";
import { scaleFood } from "./nutrition";

const seed = (p: string) => readFileSync(new URL(`../../../supabase/seed/${p}`, import.meta.url), "utf8");

/** Minimal CSV reader (quoted fields with commas). */
function readCsv(text: string): Record<string, string>[] {
  const rows = text.trim().split(/\r?\n/).map((line) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (c === '"' && q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = !q;
      else if (c === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  });
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ""])));
}

const fnri = new Map(readCsv(seed("foods_fnri.csv")).map((f) => [f.external_id!, f]));
const source = JSON.parse(seed("recipes.source.json")) as { recipes: { slug: string; ingredients: [string | null, number, string][] }[] };
const app = new Map((JSON.parse(seed("recipes.json")) as { slug: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[]).map((r) => [r.slug, r]));

/** Hand calculation: Σ grams / 100 × per-100 g value, over FNRI ingredients. */
function byHand(ingredients: [string | null, number, string][]) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const [id, grams] of ingredients) {
    if (!id) continue;
    const f = fnri.get(id);
    if (!f) throw new Error(`FNRI ${id} missing`);
    t.kcal += (Number(f.kcal_100g) * grams) / 100;
    t.protein += (Number(f.protein_100g) * grams) / 100;
    t.carbs += (Number(f.carbs_100g) * grams) / 100;
    t.fat += (Number(f.fat_100g) * grams) / 100;
  }
  return t;
}
const ape = (app: number, ref: number) => (ref === 0 ? 0 : Math.abs(app - ref) / ref);

describe("PRD §12.4 meals: app nutrition vs hand calculation from FNRI", () => {
  // The 20 sample meals: every third recipe, so Filipino and other dishes and all meal slots are covered.
  const sample = source.recipes.filter((_, i) => i % 3 === 0).slice(0, 20);

  it("uses 20 meals", () => expect(sample).toHaveLength(20));

  it("kcal and macros are within 5 % MAPE (target), and kcal within 1 kcal of the hand calculation", () => {
    const errs = { kcal: [] as number[], protein: [] as number[], carbs: [] as number[], fat: [] as number[] };
    for (const r of sample) {
      const ref = byHand(r.ingredients);
      const a = app.get(r.slug)!;
      expect(Math.abs(a.kcal - ref.kcal)).toBeLessThanOrEqual(1); // shown rounded to whole kcal
      errs.kcal.push(ape(a.kcal, ref.kcal));
      errs.protein.push(ape(a.protein_g, ref.protein));
      errs.carbs.push(ape(a.carbs_g, ref.carbs));
      errs.fat.push(ape(a.fat_g, ref.fat));
    }
    for (const list of Object.values(errs)) expect(list.reduce((s, x) => s + x, 0) / list.length).toBeLessThan(0.05);
  });

  it("logging a food by weight matches grams / 100 × the FNRI value", () => {
    const cases: [string, number][] = [["A020", 150], ["F093", 120], ["H003", 50], ["D257", 80], ["G074", 100]];
    for (const [id, grams] of cases) {
      const f = fnri.get(id)!;
      const snap = scaleFood({ kcal_100g: +f.kcal_100g!, protein_100g: +f.protein_100g!, carbs_100g: +f.carbs_100g!, fat_100g: +f.fat_100g!, fiber_100g: +f.fiber_100g! }, grams);
      expect(snap.kcal).toBeCloseTo((Number(f.kcal_100g) * grams) / 100, 1);
    }
  });
});

describe("PRD §12.4 targets: Mifflin-St Jeor for 10 profiles, exact match", () => {
  // [sex, age, height cm, weight kg, activity, BMR by hand, BMR rounded, TDEE = BMR × factor, rounded half-up]
  const profiles: [Sex, number, number, number, ActivityLevel, number, number, number][] = [
    ["female", 22, 155, 52, "light", 1217.75, 1218, 1674],
    ["male", 25, 170, 68, "moderate", 1622.5, 1623, 2515],
    ["female", 30, 160, 70, "sedentary", 1389, 1389, 1667],
    ["male", 35, 175, 90, "light", 1823.75, 1824, 2508],
    ["female", 40, 150, 58, "moderate", 1156.5, 1157, 1793],
    ["male", 45, 168, 75, "sedentary", 1580, 1580, 1896],
    ["female", 50, 162, 80, "active", 1401.5, 1402, 2418],
    ["male", 19, 180, 60, "very_active", 1635, 1635, 3107],
    ["female", 60, 155, 65, "sedentary", 1157.75, 1158, 1389],
    ["male", 55, 172, 82, "moderate", 1625, 1625, 2519],
  ];
  it.each(profiles)("%s %i y, %i cm, %i kg, %s", (sex, age, h, w, activity, bmrExact, bmr, tdee) => {
    expect(mifflinStJeor(sex, w, h, age)).toBe(bmrExact);
    const t = computeTargets({ sex, ageYears: age, heightCm: h, weightKg: w, activity, goal: "maintain" });
    expect(t.bmr).toBe(bmr);
    expect(t.tdee).toBe(tdee);
  });
});
