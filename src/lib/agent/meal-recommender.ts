import type { Explanation } from "./types";
import { cosine } from "./vectors";

// PRD §7.5 (MEAL-01…05). Pure content-based filtering: recipe catalogue + profile in, 7-day plan out.

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export const PLAN_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
/** Share of the daily kcal target per slot (PRD §7.5 step 3). */
export const SLOT_SHARE: Record<MealSlot, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 };

export type DietPattern = "omnivore" | "pescatarian" | "vegetarian";

export type CatalogRecipe = {
  slug: string;
  name: string;
  is_filipino: boolean;
  meal_slots: string[];
  tags: string[];
  allergens: string[];
  diet_pattern: string;
  cost_level: string;
  prep_minutes: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  ingredients?: { name: string }[];
};

export type MealProfile = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  dietPattern: DietPattern;
  allergies: string[];
  /** Free-text foods the user won't eat, matched against recipe and ingredient names. */
  dislikes: string[];
  budget: "low" | "mid";
  filipinoFirst: boolean;
  /** Recipe slugs rated 👍 / 👎 (MEAL-04). */
  liked?: string[];
  disliked?: string[];
  /**
   * The previous plan's recipes per day offset (same calendar day as this plan's day). Penalised so
   * "New plan" brings different dishes: strongly on the same day, lightly anywhere in the week.
   */
  previousByDay?: string[][];
  /** AGENT-03 hunger rule: rank high-fiber recipes higher. */
  favorHighFiber?: boolean;
};

export type PlannedMeal = {
  slot: MealSlot;
  slug: string;
  servings: number;
  score: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  why: string[];
};
export type PlannedDay = { dayOffset: number; meals: PlannedMeal[]; kcal: number; proteinG: number; withinTarget: boolean };
export type MealPlan = Explanation & { days: PlannedDay[] };

const TAGS = ["soup", "rice_dish", "vegetable", "seafood", "chicken", "pork", "beef", "egg", "noodle"] as const;
const PROTEIN_TAGS = ["chicken", "pork", "beef", "seafood", "egg"] as const;
const MIN_SERVINGS = 0.5;
const MAX_SERVINGS = 2;
const STEP = 0.25;
const KCAL_TOLERANCE = 0.1;
const PROTEIN_FLOOR = 0.9;
const MAX_SWAPS = 20;
const KCAL_NORM = 800;
const FIBER_NORM = 10;

const DIET_ALLOWS: Record<DietPattern, string[]> = {
  omnivore: ["omnivore", "pescatarian", "vegetarian"],
  pescatarian: ["pescatarian", "vegetarian"],
  vegetarian: ["vegetarian"],
};

type Vec = Record<string, number>;

/**
 * Feature weights applied to both vectors before cosine. Without them the binary flags (Filipino,
 * budget, quick) swamp the macro shares, which are small fractions, and every plan converges on
 * the same handful of cheap quick dishes.
 */
const WEIGHTS: Record<string, number> = {
  protein_pct: 3, carb_pct: 1.5, fat_pct: 1.5, kcal_norm: 1, fiber_norm: 0.5,
  is_filipino: 0.6, budget_low: 0.4, prep_quick: 0.3,
};
const weighted = (v: Vec): Vec =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x * (WEIGHTS[k] ?? 0.8)]));
const similarity = (u: Vec, r: Vec) => cosine(weighted(u), weighted(r));

/** Hard filters (step 1): allergens, diet pattern, dislikes, slot. */
export function eligibleRecipe(r: CatalogRecipe, p: MealProfile, slot?: MealSlot): boolean {
  if (slot && !r.meal_slots.includes(slot)) return false;
  if (r.allergens.some((a) => p.allergies.includes(a))) return false;
  if (!DIET_ALLOWS[p.dietPattern].includes(r.diet_pattern)) return false;
  const text = [r.name, ...(r.ingredients ?? []).map((i) => i.name)].join(" ").toLowerCase();
  return !p.dislikes.some((d) => d.trim() && text.includes(d.trim().toLowerCase()));
}

/** Recipe feature vector (step 2), every feature in 0–1. */
export function recipeVector(r: CatalogRecipe): Vec {
  const kcal = Math.max(r.kcal, 1);
  const v: Vec = {
    protein_pct: (r.protein_g * 4) / kcal,
    carb_pct: (r.carbs_g * 4) / kcal,
    fat_pct: (r.fat_g * 9) / kcal,
    kcal_norm: Math.min(r.kcal / KCAL_NORM, 1),
    fiber_norm: Math.min(r.fiber_g / FIBER_NORM, 1),
    is_filipino: r.is_filipino ? 1 : 0,
    budget_low: r.cost_level === "low" ? 1 : 0,
    prep_quick: (r.prep_minutes ?? 60) <= 20 ? 1 : 0,
  };
  for (const t of TAGS) v[`tag_${t}`] = r.tags.includes(t) ? 1 : 0;
  return v;
}

/** Profile half of the user vector (step 3) for one slot. */
export function profileVector(p: MealProfile, slot: MealSlot): Vec {
  const total = p.proteinG * 4 + p.carbsG * 4 + p.fatG * 9 || 1;
  return {
    protein_pct: (p.proteinG * 4) / total,
    carb_pct: (p.carbsG * 4) / total,
    fat_pct: (p.fatG * 9) / total,
    kcal_norm: Math.min((p.kcal * SLOT_SHARE[slot]) / KCAL_NORM, 1),
    fiber_norm: p.favorHighFiber ? 1 : 0.6,
    is_filipino: p.filipinoFirst ? 1 : 0.3,
    budget_low: p.budget === "low" ? 1 : 0.3,
    prep_quick: 0.4,
    tag_vegetable: 0.4,
  };
}

function mean(vs: Vec[]): Vec {
  const out: Vec = {};
  for (const v of vs) for (const [k, x] of Object.entries(v)) out[k] = (out[k] ?? 0) + x / vs.length;
  return out;
}

function combine(parts: [number, Vec][]): Vec {
  const out: Vec = {};
  for (const [w, v] of parts) for (const [k, x] of Object.entries(v)) out[k] = (out[k] ?? 0) + w * x;
  return out;
}

/** u = 0.7·u_profile + 0.3·mean(liked) − 0.2·mean(disliked) (MEAL-04). Cosine makes normalising unnecessary. */
export function userVector(p: MealProfile, slot: MealSlot, catalog: CatalogRecipe[]): Vec {
  const bySlug = new Map(catalog.map((r) => [r.slug, r]));
  const vecs = (slugs: string[] = []) =>
    slugs.map((s) => bySlug.get(s)).filter((r): r is CatalogRecipe => !!r).map(recipeVector);
  const liked = vecs(p.liked);
  const disliked = vecs(p.disliked);
  const parts: [number, Vec][] = [[0.7, profileVector(p, slot)]];
  if (liked.length) parts.push([0.3, mean(liked)]);
  if (disliked.length) parts.push([-0.2, mean(disliked)]);
  return combine(parts);
}

function primaryProtein(r: CatalogRecipe): string {
  return PROTEIN_TAGS.find((t) => r.tags.includes(t)) ?? "plant";
}

const roundStep = (x: number) => Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(x / STEP) * STEP));

const FEATURE_REASONS: Record<string, (r: CatalogRecipe, p: MealProfile, slot: MealSlot) => string> = {
  protein_pct: (r) => `Protein-forward: ${Math.round(((r.protein_g * 4) / r.kcal) * 100)}% of its calories`,
  carb_pct: () => "Carb balance matches your targets",
  fat_pct: () => "Fat level matches your targets",
  kcal_norm: (_r, p, slot) => `Close to your ~${Math.round(p.kcal * SLOT_SHARE[slot])} kcal ${slot}`,
  fiber_norm: (r) => `Good fiber (${r.fiber_g} g per serving)`,
  is_filipino: () => "Filipino home cooking, as you asked",
  budget_low: () => "Budget-friendly ingredients",
  prep_quick: (r) => `Quick: about ${r.prep_minutes} min`,
};

/** MEAL-02: the top matching features in plain language. */
export function explainMatch(r: CatalogRecipe, p: MealProfile, slot: MealSlot, u: Vec, likedTags: string[] = []): string[] {
  const rv = recipeVector(r);
  const reasons: string[] = [];
  if (p.liked?.includes(r.slug)) reasons.push("You gave this a 👍");
  if (p.favorHighFiber && r.fiber_g >= 5) reasons.push(`High in fiber (${r.fiber_g} g) to keep you full, from your check-in`);
  const contributions = Object.entries(weighted(rv))
    .map(([k, x]) => [k, x * (weighted(u)[k] ?? 0)] as const)
    .filter(([, c]) => c > 0.05)
    .sort((a, b) => b[1] - a[1]);
  const generic: string[] = [];
  for (const [k] of contributions) {
    if (reasons.length >= 3) break;
    if (k.startsWith("tag_")) {
      const tag = k.slice(4);
      if (likedTags.includes(tag)) reasons.push(`Like the ${tag.replace("_", " ")} dishes you gave a 👍`);
    } else if (k === "is_filipino" && !p.filipinoFirst) {
      continue;
    } else if (k === "budget_low" && p.budget !== "low") {
      continue;
    } else if (k === "protein_pct" && rv.protein_pct! < 0.2) {
      continue;
    } else if (k === "carb_pct" || k === "fat_pct") {
      generic.push(FEATURE_REASONS[k]!(r, p, slot));
    } else if (FEATURE_REASONS[k]) {
      reasons.push(FEATURE_REASONS[k](r, p, slot));
    }
  }
  // Macro-balance lines are true of most recipes, so they only fill in when nothing sharper applies.
  for (const g of generic) if (reasons.length < 2) reasons.push(g);
  return reasons;
}

/** Tags shared by the user's 👍 recipes, so "why this" only cites tastes the user actually showed. */
export function likedTagsOf(p: MealProfile, catalog: CatalogRecipe[]): string[] {
  const liked = catalog.filter((r) => p.liked?.includes(r.slug));
  return [...new Set(liked.flatMap((r) => r.tags))];
}

type Ranked = { recipe: CatalogRecipe; base: number };

/** Candidates for a slot, best first, by cosine only (penalties are applied during assembly). */
export function rankForSlot(p: MealProfile, catalog: CatalogRecipe[], slot: MealSlot): Ranked[] {
  const u = userVector(p, slot, catalog);
  return catalog
    .filter((r) => eligibleRecipe(r, p, slot))
    .map((recipe) => ({
      recipe,
      // AGENT-03 hunger rule: a direct bonus, since the fiber dimension alone barely moves the cosine.
      base: similarity(u, recipeVector(recipe)) + (p.favorHighFiber ? 0.08 * Math.min(recipe.fiber_g / FIBER_NORM, 1) : 0),
    }))
    .sort((a, b) => b.base - a.base || a.recipe.slug.localeCompare(b.recipe.slug));
}

function mealFor(r: CatalogRecipe, slot: MealSlot, servings: number, score: number, why: string[]): PlannedMeal {
  return {
    slot,
    slug: r.slug,
    servings,
    score: Math.round(score * 1000) / 1000,
    kcal: Math.round(r.kcal * servings),
    proteinG: Math.round(r.protein_g * servings * 10) / 10,
    carbsG: Math.round(r.carbs_g * servings * 10) / 10,
    fatG: Math.round(r.fat_g * servings * 10) / 10,
    why,
  };
}

type Pick = { recipe: CatalogRecipe; score: number; servings: number };

function dayCost(picks: Pick[], p: MealProfile) {
  const kcal = picks.reduce((s, x) => s + x.recipe.kcal * x.servings, 0);
  const protein = picks.reduce((s, x) => s + x.recipe.protein_g * x.servings, 0);
  const kcalErr = Math.abs(kcal - p.kcal) / p.kcal;
  const proteinShort = p.proteinG > 0 ? Math.max(0, PROTEIN_FLOOR - protein / p.proteinG) : 0;
  // Leaving the ±10% kcal band is the hard failure; inside it, protein shortfall dominates.
  const cost = 20 * Math.max(0, kcalErr - KCAL_TOLERANCE) + kcalErr + 2 * proteinShort;
  return { kcal, protein, kcalErr, proteinShort, cost };
}

/** Step 5a: servings per slot in 0.25 steps, then greedy ±0.25 moves to hit kcal and protein. */
function scaleServings(picks: Pick[], p: MealProfile): Pick[] {
  let cur = picks.map((x, i) => ({
    ...x,
    servings: roundStep((p.kcal * SLOT_SHARE[PLAN_SLOTS[i]!]) / Math.max(x.recipe.kcal, 1)),
  }));
  for (let iter = 0; iter < 24; iter++) {
    const now = dayCost(cur, p).cost;
    let best: { cost: number; next: Pick[] } | null = null;
    for (let i = 0; i < cur.length; i++) {
      for (const d of [STEP, -STEP]) {
        const s = cur[i]!.servings + d;
        if (s < MIN_SERVINGS || s > MAX_SERVINGS) continue;
        const next = cur.map((x, j) => (j === i ? { ...x, servings: s } : x));
        const cost = dayCost(next, p).cost;
        if (cost < now - 1e-9 && (!best || cost < best.cost)) best = { cost, next };
      }
    }
    if (!best) break;
    cur = best.next;
  }
  return cur;
}

function feasible(picks: Pick[], p: MealProfile) {
  const c = dayCost(picks, p);
  return c.kcalErr <= KCAL_TOLERANCE && c.proteinShort === 0;
}

/** MEAL-01: 7-day plan. Deterministic for the same inputs. */
export function recommendMealPlan(p: MealProfile, catalog: CatalogRecipe[], days = 7): MealPlan {
  const ranked = Object.fromEntries(PLAN_SLOTS.map((s) => [s, rankForSlot(p, catalog, s)])) as Record<MealSlot, Ranked[]>;
  const missing = PLAN_SLOTS.filter((s) => ranked[s].length === 0);
  if (missing.length) throw new Error(`No eligible recipes for: ${missing.join(", ")}`);
  const vectors = Object.fromEntries(PLAN_SLOTS.map((s) => [s, userVector(p, s, catalog)])) as Record<MealSlot, Vec>;
  const likedTags = likedTagsOf(p, catalog);

  const prevAll = new Set((p.previousByDay ?? []).flat());
  const history: { day: number; slug: string }[] = [];
  const out: PlannedDay[] = [];
  let prevProtein: string | null = null;

  for (let day = 0; day < days; day++) {
    const recent = new Set(history.filter((h) => h.day >= day - 3).map((h) => h.slug));
    const weekUses = (slug: string) => history.filter((h) => h.slug === slug).length;
    // Step 4: penalised scores per slot, in slot order so "previous meal" is well defined.
    const options: Record<MealSlot, { recipe: CatalogRecipe; score: number }[]> = {} as never;
    let picks: Pick[] = [];
    let last = prevProtein;
    for (const slot of PLAN_SLOTS) {
      const usedToday = new Set(picks.map((x) => x.recipe.slug));
      options[slot] = ranked[slot]
        .filter((c) => !usedToday.has(c.recipe.slug))
        .map((c) => ({
          recipe: c.recipe,
          score:
            c.base -
            (recent.has(c.recipe.slug) ? 0.15 : 0) -
            // Beyond the PRD's 3-day rule: a small per-use penalty so the week doesn't loop every 4 days.
            0.03 * weekUses(c.recipe.slug) -
            (p.previousByDay?.[day]?.includes(c.recipe.slug) ? 0.2 : prevAll.has(c.recipe.slug) ? 0.05 : 0) -
            (slot !== "snack" && last && primaryProtein(c.recipe) === last && last !== "plant" ? 0.1 : 0),
        }))
        .sort((a, b) => b.score - a.score || a.recipe.slug.localeCompare(b.recipe.slug));
      // Every candidate already used today (tiny catalogues only): fall back to the best one.
      const top = options[slot][0] ?? { recipe: ranked[slot][0]!.recipe, score: ranked[slot][0]!.base };
      picks.push({ recipe: top.recipe, score: top.score, servings: 1 });
      if (slot !== "snack") last = primaryProtein(top.recipe);
    }
    picks = scaleServings(picks, p);

    // Step 5b: greedy swaps toward the next candidate in the slot that helps most.
    const cursor: Record<MealSlot, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    for (let iter = 0; iter < MAX_SWAPS && !feasible(picks, p); iter++) {
      let best: { cost: number; next: Pick[]; slot: MealSlot } | null = null;
      PLAN_SLOTS.forEach((slot, i) => {
        const cand = options[slot][cursor[slot] + 1];
        if (!cand || picks.some((x, j) => j !== i && x.recipe.slug === cand.recipe.slug)) return;
        const next = scaleServings(picks.map((x, j) => (j === i ? { ...cand, servings: 1 } : x)), p);
        const cost = dayCost(next, p).cost;
        if (!best || cost < best.cost) best = { cost, next, slot };
      });
      if (!best) break;
      const b = best as { cost: number; next: Pick[]; slot: MealSlot };
      cursor[b.slot] += 1;
      if (b.cost < dayCost(picks, p).cost) picks = b.next;
    }

    const meals = picks.map((x, i) => {
      const slot = PLAN_SLOTS[i]!;
      return mealFor(x.recipe, slot, x.servings, x.score, explainMatch(x.recipe, p, slot, vectors[slot], likedTags));
    });
    const c = dayCost(picks, p);
    out.push({
      dayOffset: day,
      meals,
      kcal: Math.round(c.kcal),
      proteinG: Math.round(c.protein),
      withinTarget: c.kcalErr <= KCAL_TOLERANCE,
    });
    for (const m of meals) history.push({ day, slug: m.slug });
    prevProtein = primaryProtein(picks[2]!.recipe);
  }

  const reasons = [
    `Meals are matched to your ${p.kcal.toLocaleString("en-US")} kcal target split ${PLAN_SLOTS.map((s) => `${s} ${SLOT_SHARE[s] * 100}%`).join(", ")}.`,
    `Servings are scaled in quarter steps so each day lands within ±10% of your calories and near your ${p.proteinG} g protein.`,
  ];
  if (p.allergies.length) reasons.push(`Recipes containing ${p.allergies.join(", ")} are never suggested.`);
  if (p.dietPattern !== "omnivore") reasons.push(`Only ${p.dietPattern}-friendly recipes are included.`);
  if (p.filipinoFirst) reasons.push("Filipino dishes are ranked higher, as you asked.");
  if (p.favorHighFiber) reasons.push("High-fiber recipes are favoured because you reported feeling hungry.");
  if (p.liked?.length || p.disliked?.length) reasons.push("Your 👍/👎 ratings shift the picks toward dishes like the ones you liked.");
  const ruleIds = ["MEAL-FILTER", "MEAL-COSINE", "MEAL-SCALE"];
  if (p.liked?.length || p.disliked?.length) ruleIds.push("MEAL-RATINGS");
  return { ruleIds, reasons, days: out };
}

/**
 * MEAL-03: the next-best recipe for a slot after `currentSlug` (cycling), excluding `avoid`
 * (e.g. the day's other meals). Servings keep the replaced meal's calories.
 */
export function recommendSwap(
  p: MealProfile,
  catalog: CatalogRecipe[],
  slot: MealSlot,
  currentSlug: string,
  targetKcal: number,
  avoid: string[] = [],
): PlannedMeal | null {
  const ranked = rankForSlot(p, catalog, slot);
  const start = ranked.findIndex((c) => c.recipe.slug === currentSlug);
  for (let k = 1; k <= ranked.length; k++) {
    const c = ranked[(start + k + ranked.length) % ranked.length]!;
    if (c.recipe.slug === currentSlug || avoid.includes(c.recipe.slug)) continue;
    const servings = roundStep(targetKcal / Math.max(c.recipe.kcal, 1));
    return mealFor(c.recipe, slot, servings, c.base, explainMatch(c.recipe, p, slot, userVector(p, slot, catalog), likedTagsOf(p, catalog)));
  }
  return null;
}
