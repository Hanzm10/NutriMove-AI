import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { sumSnapshots } from "./nutrition";

type DB = SupabaseClient<Database>;

/** Everything the Nutrition and Overview screens need for one day (FOOD-05, DASH-01/04). */
export async function loadDay(supabase: DB, userId: string, date: string) {
  const [{ data: targets }, { data: logs }, { data: water }, { data: settings }] = await Promise.all([
    supabase.from("targets").select("kcal, protein_g, carbs_g, fat_g, fiber_g, explanation")
      .eq("user_id", userId).lte("effective_from", date)
      .order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("food_logs").select("id, food_id, recipe_id, name, meal_slot, quantity_g, kcal, protein_g, carbs_g, fat_g, fiber_g, created_at")
      .eq("user_id", userId).eq("log_date", date).order("created_at"),
    supabase.from("water_logs").select("glasses").eq("user_id", userId).eq("log_date", date).maybeSingle(),
    supabase.from("user_settings").select("water_goal").eq("user_id", userId).maybeSingle(),
  ]);
  const list = (logs ?? []).map((l) => ({
    ...l,
    quantity_g: Number(l.quantity_g), kcal: Number(l.kcal), protein_g: Number(l.protein_g),
    carbs_g: Number(l.carbs_g), fat_g: Number(l.fat_g), fiber_g: Number(l.fiber_g),
  }));
  return {
    date,
    targets,
    logs: list,
    totals: sumSnapshots(list),
    water: water?.glasses ?? 0,
    waterGoal: settings?.water_goal ?? 8,
  };
}

export type DayData = Awaited<ReturnType<typeof loadDay>>;
