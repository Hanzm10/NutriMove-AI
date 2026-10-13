"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NoRecipesError, recommendSwap, type MealSlot } from "@/lib/agent/meal-recommender";
import { todayISO } from "@/lib/dates";
import { generateMealPlan, loadCatalog, loadMealProfile } from "@/lib/meals/plan";
import { requireUser } from "@/lib/supabase/auth";
import type { Json } from "@/lib/supabase/database.types";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const refresh = () => {
  revalidatePath("/nutrition");
  revalidatePath("/overview");
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** MEAL-01: a fresh 7-day plan from today (also picks up new 👍/👎 ratings). */
export async function regenerateMealPlan(): Promise<Result> {
  const { supabase, user } = await requireUser();
  try {
    await generateMealPlan(supabase, user.id);
  } catch (e) {
    if (e instanceof NoRecipesError) {
      return {
        ok: false,
        error: `We don't have enough recipes that fit your allergies and diet yet (no ${e.slots.join(" or ")} options). You can still log meals from the Today tab, and we're adding recipes.`,
      };
    }
    console.error("meal plan generation failed", e);
    return { ok: false, error: "Could not build a plan. Check that onboarding is finished." };
  }
  refresh();
  return { ok: true };
}

/** MEAL-03: replace one planned meal with the next-best recipe for that slot, keeping its calories. */
export async function swapMeal(itemId: string): Promise<Result> {
  if (!z.uuid().safeParse(itemId).success) return { ok: false, error: "Invalid meal" };
  const { supabase, user } = await requireUser();
  const { data: item } = await supabase
    .from("meal_plan_items").select("id, meal_plan_id, day, meal_slot, recipe_id, servings")
    .eq("id", itemId).eq("user_id", user.id).single();
  if (!item) return { ok: false, error: "Meal not found" };
  const [catalog, { data: sameDay }] = await Promise.all([
    loadCatalog(supabase),
    supabase.from("meal_plan_items").select("recipe_id").eq("meal_plan_id", item.meal_plan_id).eq("day", item.day),
  ]);
  const profile = await loadMealProfile(supabase, user.id, catalog);
  const current = catalog.find((r) => r.id === item.recipe_id);
  if (!profile || !current) return { ok: false, error: "Could not load your preferences" };
  const slugById = new Map(catalog.map((r) => [r.id, r.slug]));
  const avoid = (sameDay ?? []).map((r) => slugById.get(r.recipe_id)).filter((s): s is string => !!s);
  const next = recommendSwap(profile, catalog, item.meal_slot as MealSlot, current.slug, current.kcal * Number(item.servings), avoid);
  if (!next) return { ok: false, error: "No other recipe fits this meal and your preferences." };
  const recipe = catalog.find((r) => r.slug === next.slug)!;
  const { error } = await supabase
    .from("meal_plan_items").update({ recipe_id: recipe.id, servings: next.servings, score: next.score }).eq("id", item.id);
  if (error) return { ok: false, error: "Could not swap. Please try again." };
  await supabase.from("agent_events").insert({
    user_id: user.id,
    kind: "meal_plan.swap",
    input: { item: item.id, from: current.slug } as Json,
    output: { to: next.slug, servings: next.servings } as Json,
    rule_ids: ["MEAL-SWAP"],
  });
  refresh();
  return { ok: true, message: `Swapped to ${recipe.name}` };
}

const rateSchema = z.object({ recipeId: z.uuid(), rating: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

/** MEAL-04: 👍 / 👎 a recipe (0 clears). Used on the next plan generation and in swaps. */
export async function rateRecipe(input: z.input<typeof rateSchema>): Promise<Result> {
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid rating" };
  const { supabase, user } = await requireUser();
  const { recipeId, rating } = parsed.data;
  const { error } =
    rating === 0
      ? await supabase.from("recipe_ratings").delete().eq("user_id", user.id).eq("recipe_id", recipeId)
      : await supabase.from("recipe_ratings").upsert({ user_id: user.id, recipe_id: recipeId, rating });
  if (error) return { ok: false, error: "Could not save your rating" };
  revalidatePath("/nutrition");
  return { ok: true };
}

/** FOOD-09: log a planned meal in one tap. Nutrients come from the recipe row × planned servings. */
export async function logPlannedMeal(itemId: string): Promise<Result> {
  if (!z.uuid().safeParse(itemId).success) return { ok: false, error: "Invalid meal" };
  const { supabase, user } = await requireUser();
  const { data: item } = await supabase
    .from("meal_plan_items")
    .select("id, day, meal_slot, servings, recipe:recipes(id, name, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g)")
    .eq("id", itemId).eq("user_id", user.id).single();
  if (!item?.recipe) return { ok: false, error: "Meal not found" };
  if (item.day > todayISO()) return { ok: false, error: "You can log this meal on its day." };
  const { data: existing } = await supabase
    .from("food_logs").select("id").eq("user_id", user.id).eq("from_plan_item_id", item.id).limit(1).maybeSingle();
  if (existing) return { ok: false, error: "Already logged" };
  const r = item.recipe;
  const k = Number(item.servings);
  const { error } = await supabase.from("food_logs").insert({
    user_id: user.id,
    recipe_id: r.id,
    from_plan_item_id: item.id,
    name: k === 1 ? r.name : `${r.name} (${k} servings)`,
    log_date: item.day,
    meal_slot: item.meal_slot,
    quantity_g: r1(Number(r.serving_g) * k),
    kcal: r1(Number(r.kcal) * k),
    protein_g: r1(Number(r.protein_g) * k),
    carbs_g: r1(Number(r.carbs_g) * k),
    fat_g: r1(Number(r.fat_g) * k),
    fiber_g: r1(Number(r.fiber_g) * k),
  });
  if (error) return { ok: false, error: "Could not log. Please try again." };
  refresh();
  return { ok: true, message: `Logged ${r.name}` };
}
