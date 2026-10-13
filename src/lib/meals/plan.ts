import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  explainMatch,
  likedTagsOf,
  recommendMealPlan,
  userVector,
  type CatalogRecipe,
  type MealProfile,
  type MealSlot,
} from "@/lib/agent/meal-recommender";
import { addDaysISO, todayISO } from "@/lib/dates";
import type { Database, Json } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

const RECIPE_FIELDS =
  "id, slug, name, is_filipino, meal_slots, tags, allergens, diet_pattern, cost_level, prep_minutes, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g, ingredients, instructions, source_ref";

export type Recipe = Omit<CatalogRecipe, "ingredients"> & {
  id: string;
  serving_g: number;
  ingredients: { name: string; grams: number; fnri_id: string | null }[];
  instructions: string | null;
  source_ref: string | null;
};

export async function loadCatalog(supabase: DB): Promise<Recipe[]> {
  const { data } = await supabase.from("recipes").select(RECIPE_FIELDS).order("slug");
  return (data ?? []).map((r) => ({
    ...r,
    serving_g: Number(r.serving_g),
    kcal: Number(r.kcal),
    protein_g: Number(r.protein_g),
    carbs_g: Number(r.carbs_g),
    fat_g: Number(r.fat_g),
    fiber_g: Number(r.fiber_g),
    ingredients: (r.ingredients ?? []) as Recipe["ingredients"],
  }));
}

type DietPrefs = { pattern?: MealProfile["dietPattern"]; allergies?: string[]; dislikes?: string[]; budget?: "low" | "mid"; filipinoFirst?: boolean };

/** Profile diet prefs + latest targets + 👍/👎 ratings → recommender input. */
export async function loadMealProfile(supabase: DB, userId: string, catalog: Recipe[]): Promise<MealProfile | null> {
  const [{ data: profile }, { data: targets }, { data: ratings }] = await Promise.all([
    supabase.from("profiles").select("diet_prefs, adapt_state").eq("user_id", userId).single(),
    supabase.from("targets").select("kcal, protein_g, carbs_g, fat_g").eq("user_id", userId)
      .lte("effective_from", todayISO())
      .order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("recipe_ratings").select("recipe_id, rating").eq("user_id", userId),
  ]);
  if (!targets) return null;
  const prefs = (profile?.diet_prefs ?? {}) as DietPrefs;
  const slugById = new Map(catalog.map((r) => [r.id, r.slug]));
  const rated = (v: number) => (ratings ?? []).filter((r) => r.rating === v).map((r) => slugById.get(r.recipe_id)).filter((s): s is string => !!s);
  return {
    kcal: Number(targets.kcal),
    proteinG: Number(targets.protein_g),
    carbsG: Number(targets.carbs_g),
    fatG: Number(targets.fat_g),
    dietPattern: prefs.pattern ?? "omnivore",
    allergies: prefs.allergies ?? [],
    dislikes: prefs.dislikes ?? [],
    budget: prefs.budget ?? "low",
    filipinoFirst: prefs.filipinoFirst ?? true,
    favorHighFiber: Boolean((profile?.adapt_state as { favorHighFiber?: boolean } | null)?.favorHighFiber),
    liked: rated(1),
    disliked: rated(-1),
  };
}

/** MEAL-01: build a 7-day plan starting today and store it. */
export async function generateMealPlan(supabase: DB, userId: string) {
  const catalog = await loadCatalog(supabase);
  const profile = await loadMealProfile(supabase, userId, catalog);
  if (!profile || !catalog.length) throw new Error("Missing targets or recipe catalogue");
  const weekStart = todayISO();
  const { data: last } = await supabase
    .from("meal_plans").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last) {
    const { data: prevItems } = await supabase.from("meal_plan_items").select("day, recipe_id").eq("meal_plan_id", last.id);
    const slugById = new Map(catalog.map((r) => [r.id, r.slug]));
    profile.previousByDay = Array.from({ length: 7 }, (_, i) =>
      (prevItems ?? []).filter((it) => it.day === addDaysISO(weekStart, i)).map((it) => slugById.get(it.recipe_id)).filter((s): s is string => !!s));
  }
  const plan = recommendMealPlan(profile, catalog);

  const { data: row, error } = await supabase
    .from("meal_plans")
    .insert({
      user_id: userId,
      week_start: weekStart,
      explanation: {
        ruleIds: plan.ruleIds,
        reasons: plan.reasons,
        daysWithinTarget: plan.days.filter((d) => d.withinTarget).length,
      } as Json,
    })
    .select("id")
    .single();
  if (error || !row) throw error ?? new Error("Could not save meal plan");

  const idBySlug = new Map(catalog.map((r) => [r.slug, r.id]));
  const items = plan.days.flatMap((d) =>
    d.meals.map((m) => ({
      user_id: userId,
      meal_plan_id: row.id,
      day: addDaysISO(weekStart, d.dayOffset),
      meal_slot: m.slot,
      recipe_id: idBySlug.get(m.slug)!,
      servings: m.servings,
      score: m.score,
    })),
  );
  const { error: iErr } = await supabase.from("meal_plan_items").insert(items);
  if (iErr) throw iErr;
  await supabase.from("agent_events").insert({
    user_id: userId,
    kind: "meal_plan.generated",
    input: profile as unknown as Json,
    output: { days: plan.days.map((d) => ({ kcal: d.kcal, protein: d.proteinG, ok: d.withinTarget })) } as Json,
    rule_ids: plan.ruleIds,
  });
  return row.id;
}

const SLOT_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

/** Latest plan, its items with recipe details and a fresh "why this" (MEAL-02), grouped by day. */
export async function loadCurrentMealPlan(supabase: DB, userId: string) {
  const { data: plan } = await supabase
    .from("meal_plans").select("*").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!plan) return null;
  const [{ data: items }, catalog, { data: logs }] = await Promise.all([
    supabase.from("meal_plan_items").select("id, day, meal_slot, recipe_id, servings, score").eq("meal_plan_id", plan.id).order("day"),
    loadCatalog(supabase),
    supabase.from("food_logs").select("from_plan_item_id").eq("user_id", userId).not("from_plan_item_id", "is", null)
      .gte("log_date", plan.week_start),
  ]);
  const profile = await loadMealProfile(supabase, userId, catalog);
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const logged = new Set((logs ?? []).map((l) => l.from_plan_item_id));
  const ratings = new Map<string, number>([
    ...(profile?.liked ?? []).map((s) => [s, 1] as [string, number]),
    ...(profile?.disliked ?? []).map((s) => [s, -1] as [string, number]),
  ]);
  const vectors = new Map<MealSlot, ReturnType<typeof userVector>>();
  const likedTags = profile ? likedTagsOf(profile, catalog) : [];
  const why = (r: Recipe, slot: MealSlot) => {
    if (!profile) return [];
    if (!vectors.has(slot)) vectors.set(slot, userVector(profile, slot, catalog));
    return explainMatch(r, profile, slot, vectors.get(slot)!, likedTags);
  };

  const days = new Map<string, PlanMeal[]>();
  for (const it of items ?? []) {
    const recipe = byId.get(it.recipe_id);
    if (!recipe) continue;
    const servings = Number(it.servings);
    const slot = it.meal_slot as MealSlot;
    const meal: PlanMeal = {
      id: it.id,
      day: it.day,
      slot,
      servings,
      recipe,
      kcal: Math.round(recipe.kcal * servings),
      proteinG: Math.round(recipe.protein_g * servings),
      carbsG: Math.round(recipe.carbs_g * servings),
      fatG: Math.round(recipe.fat_g * servings),
      why: why(recipe, slot),
      logged: logged.has(it.id),
      rating: ratings.get(recipe.slug) ?? 0,
    };
    days.set(it.day, [...(days.get(it.day) ?? []), meal]);
  }
  return {
    plan,
    today: todayISO(),
    targetKcal: profile?.kcal ?? null,
    targetProtein: profile?.proteinG ?? null,
    days: [...days.entries()].map(([day, meals]) => {
      const sorted = meals.sort((a, b) => SLOT_ORDER[a.slot]! - SLOT_ORDER[b.slot]!);
      return {
        day,
        meals: sorted,
        kcal: sorted.reduce((s, m) => s + m.kcal, 0),
        proteinG: sorted.reduce((s, m) => s + m.proteinG, 0),
      };
    }),
  };
}

export type PlanMeal = {
  id: string;
  day: string;
  slot: MealSlot;
  servings: number;
  recipe: Recipe;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  why: string[];
  logged: boolean;
  rating: number;
};
export type MealPlanView = NonNullable<Awaited<ReturnType<typeof loadCurrentMealPlan>>>;
