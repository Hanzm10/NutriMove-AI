import { describe, expect, it } from "vitest";
import recipes from "../../../supabase/seed/recipes.json";
import {
  PLAN_SLOTS,
  eligibleRecipe,
  rankForSlot,
  recommendMealPlan,
  recommendSwap,
  type CatalogRecipe,
  type MealProfile,
} from "./meal-recommender";

const catalog = recipes as CatalogRecipe[];
const bySlug = new Map(catalog.map((r) => [r.slug, r]));

const base: MealProfile = {
  kcal: 1890,
  proteinG: 112,
  carbsG: 230,
  fatG: 53,
  dietPattern: "omnivore",
  allergies: [],
  dislikes: [],
  budget: "low",
  filipinoFirst: true,
};

const profiles: Record<string, MealProfile> = {
  "omnivore 1890": base,
  "female floor 1200": { ...base, kcal: 1200, proteinG: 88, carbsG: 120, fatG: 40 },
  "vegetarian, soy + peanut allergy": {
    ...base, kcal: 1520, proteinG: 70, carbsG: 200, fatG: 45, dietPattern: "vegetarian", allergies: ["soy", "peanut"],
  },
  "pescatarian, shellfish allergy": { ...base, kcal: 1700, proteinG: 95, dietPattern: "pescatarian", allergies: ["shellfish"] },
  "gain 2800": { ...base, kcal: 2800, proteinG: 130, carbsG: 380, fatG: 78, budget: "mid", filipinoFirst: false },
  "egg + milk + wheat allergy": { ...base, allergies: ["egg", "milk", "wheat"] },
};

describe("recipe seed (PRD §7.5 data)", () => {
  it("has at least 50 recipes, 60%+ Filipino, every slot covered", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(50);
    expect(catalog.filter((r) => r.is_filipino).length / catalog.length).toBeGreaterThanOrEqual(0.6);
    for (const s of PLAN_SLOTS) expect(catalog.filter((r) => r.meal_slots.includes(s)).length).toBeGreaterThanOrEqual(8);
  });
});

describe("recommendMealPlan (MEAL-01)", () => {
  for (const [name, p] of Object.entries(profiles)) {
    describe(name, () => {
      const plan = recommendMealPlan(p, catalog);

      it("produces 7 days × 4 slots", () => {
        expect(plan.days).toHaveLength(7);
        for (const d of plan.days) expect(d.meals.map((m) => m.slot)).toEqual(PLAN_SLOTS);
      });

      it("lands ≥ 6 of 7 days within ±10% of the kcal target", () => {
        const ok = plan.days.filter((d) => Math.abs(d.kcal - p.kcal) / p.kcal <= 0.1).length;
        expect(ok).toBeGreaterThanOrEqual(6);
      });

      it("never violates allergies, diet pattern or slot", () => {
        for (const d of plan.days) {
          for (const m of d.meals) {
            const r = bySlug.get(m.slug)!;
            expect(eligibleRecipe(r, p, m.slot)).toBe(true);
            expect(r.allergens.filter((a) => p.allergies.includes(a))).toEqual([]);
          }
        }
      });

      it("keeps servings in 0.25 steps between 0.5 and 2", () => {
        for (const m of plan.days.flatMap((d) => d.meals)) {
          expect(m.servings).toBeGreaterThanOrEqual(0.5);
          expect(m.servings).toBeLessThanOrEqual(2);
          expect((m.servings * 4) % 1).toBe(0);
        }
      });

      it("explains every meal (MEAL-02)", () => {
        for (const m of plan.days.flatMap((d) => d.meals)) expect(m.why.length).toBeGreaterThan(0);
        expect(plan.reasons.length).toBeGreaterThan(0);
      });
    });
  }

  it("reaches ≥ 90% protein on most days for a typical omnivore", () => {
    const plan = recommendMealPlan(base, catalog);
    expect(plan.days.filter((d) => d.proteinG >= base.proteinG * 0.9).length).toBeGreaterThanOrEqual(5);
  });

  it("a regenerated plan brings in new dishes when given the previous plan", () => {
    const first = recommendMealPlan(base, catalog).days.map((d) => d.meals.map((m) => m.slug));
    const second = recommendMealPlan({ ...base, previousByDay: first }, catalog).days.map((d) => d.meals.map((m) => m.slug));
    for (let i = 0; i < 7; i++) expect(second[i]).not.toEqual(first[i]);
    expect(second.flat().filter((s) => !first.flat().includes(s)).length).toBeGreaterThan(3);
  });

  it("is deterministic", () => {
    expect(recommendMealPlan(base, catalog)).toEqual(recommendMealPlan(base, catalog));
  });

  it("varies meals: no recipe repeats in the same slot on consecutive days", () => {
    const plan = recommendMealPlan(base, catalog);
    for (const slot of ["lunch", "dinner"] as const) {
      const seq = plan.days.map((d) => d.meals.find((m) => m.slot === slot)!.slug);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    }
  });

  it("never repeats a recipe within the same day", () => {
    for (const d of recommendMealPlan(base, catalog).days) {
      expect(new Set(d.meals.map((m) => m.slug)).size).toBe(d.meals.length);
    }
  });

  it("excludes dislikes by recipe or ingredient name", () => {
    const p = { ...base, dislikes: ["ampalaya", "Liver"] };
    const slugs = recommendMealPlan(p, catalog).days.flatMap((d) => d.meals.map((m) => m.slug));
    for (const s of slugs) {
      const r = bySlug.get(s)!;
      const text = [r.name, ...(r.ingredients ?? []).map((i) => i.name)].join(" ").toLowerCase();
      expect(text).not.toContain("ampalaya");
      expect(text).not.toContain("liver");
    }
  });

  it("ranks Filipino dishes higher when filipinoFirst is set", () => {
    const fil = (p: MealProfile) =>
      recommendMealPlan(p, catalog).days.flatMap((d) => d.meals).filter((m) => bySlug.get(m.slug)!.is_filipino).length;
    expect(fil({ ...base, filipinoFirst: true })).toBeGreaterThan(fil({ ...base, filipinoFirst: false }));
  });

  it("throws a clear error when a slot has no eligible recipe", () => {
    const tiny = catalog.filter((r) => !r.meal_slots.includes("snack"));
    expect(() => recommendMealPlan(base, tiny)).toThrow(/snack/);
  });
});

describe("ratings (MEAL-04)", () => {
  it("👍 seafood dishes pull more seafood into the next plan, 👎 pushes it away", () => {
    const seafood = (p: MealProfile) =>
      recommendMealPlan(p, catalog).days.flatMap((d) => d.meals).filter((m) => bySlug.get(m.slug)!.tags.includes("seafood")).length;
    const liked = ["sinigang-na-hipon", "paksiw-na-bangus", "inihaw-na-tilapia", "pritong-galunggong"];
    expect(seafood({ ...base, liked })).toBeGreaterThan(seafood(base));
    expect(seafood({ ...base, disliked: liked })).toBeLessThan(seafood(base));
  });

  it("mentions the 👍 in the explanation", () => {
    const top = rankForSlot({ ...base, liked: ["chicken-adobo"] }, catalog, "lunch");
    const plan = recommendMealPlan({ ...base, liked: ["chicken-adobo"] }, catalog);
    const adobo = plan.days.flatMap((d) => d.meals).find((m) => m.slug === "chicken-adobo");
    expect(top.some((c) => c.recipe.slug === "chicken-adobo")).toBe(true);
    if (adobo) expect(adobo.why[0]).toMatch(/👍/);
  });
});

describe("recommendSwap (MEAL-03)", () => {
  it("returns the next eligible candidate, not the current one or the avoided ones, at similar kcal", () => {
    const ranked = rankForSlot(base, catalog, "lunch");
    const current = ranked[0]!.recipe.slug;
    const avoid = [ranked[1]!.recipe.slug];
    const swap = recommendSwap(base, catalog, "lunch", current, 660, avoid)!;
    expect(swap.slug).toBe(ranked[2]!.recipe.slug);
    expect(Math.abs(swap.kcal - 660) / 660).toBeLessThan(0.25);
    expect(swap.why.length).toBeGreaterThan(0);
  });

  it("cycles through all candidates and respects allergies", () => {
    const p = profiles["vegetarian, soy + peanut allergy"]!;
    const seen = new Set<string>();
    let cur = rankForSlot(p, catalog, "dinner")[0]!.recipe.slug;
    for (let i = 0; i < 30; i++) {
      const s = recommendSwap(p, catalog, "dinner", cur, 450)!;
      expect(eligibleRecipe(bySlug.get(s.slug)!, p, "dinner")).toBe(true);
      seen.add(s.slug);
      cur = s.slug;
    }
    expect(seen.size).toBe(rankForSlot(p, catalog, "dinner").length);
  });

  it("returns null when there is nothing else to offer", () => {
    const only = catalog.filter((r) => r.slug === "chicken-adobo");
    expect(recommendSwap(base, only, "lunch", "chicken-adobo", 600)).toBeNull();
  });
});
