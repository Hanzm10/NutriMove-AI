"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { todayISO } from "@/lib/dates";
import { MEAL_SLOTS, scaleFood } from "@/lib/food/nutrition";
import { requireUser } from "@/lib/supabase/auth";

type Result = { ok: true } | { ok: false; error: string };
const refresh = () => {
  revalidatePath("/nutrition");
  revalidatePath("/overview");
};

const logSchema = z.object({
  foodId: z.uuid(),
  grams: z.number().positive().max(5000),
  slot: z.enum(MEAL_SLOTS),
});

/** FOOD-04: log a catalogue food. Nutrients are computed here from the DB row, never trusted from the client. */
export async function logFood(input: z.input<typeof logSchema>): Promise<Result> {
  const parsed = logSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the amount and try again." };
  const { supabase, user } = await requireUser();
  const { data: food } = await supabase
    .from("foods").select("id, name, name_local, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g")
    .eq("id", parsed.data.foodId).single();
  if (!food) return { ok: false, error: "That food is no longer available." };
  const snap = scaleFood(food, parsed.data.grams);
  const { error } = await supabase.from("food_logs").insert({
    user_id: user.id, food_id: food.id, name: food.name_local ? `${food.name} (${food.name_local})` : food.name,
    log_date: todayISO(), meal_slot: parsed.data.slot, quantity_g: parsed.data.grams, ...snap,
  });
  if (error) return { ok: false, error: "Could not save. Please try again." };
  refresh();
  return { ok: true };
}

const quickSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kcal: z.number().min(0).max(5000),
  protein_g: z.number().min(0).max(500).default(0),
  carbs_g: z.number().min(0).max(1000).default(0),
  fat_g: z.number().min(0).max(500).default(0),
  slot: z.enum(MEAL_SLOTS),
});

/** FOOD-07 (quick add): calories and macros only, no catalogue entry. */
export async function quickAdd(input: z.input<typeof quickSchema>): Promise<Result> {
  const parsed = quickSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a name and calories." };
  const { supabase, user } = await requireUser();
  const f = parsed.data;
  const { error } = await supabase.from("food_logs").insert({
    user_id: user.id, name: f.name, log_date: todayISO(), meal_slot: f.slot, quantity_g: 1,
    kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, fiber_g: 0,
  });
  if (error) return { ok: false, error: "Could not save. Please try again." };
  refresh();
  return { ok: true };
}

/** FOOD-06: change the amount of a logged item (re-snapshots from the food, or scales a quick add). */
export async function updateLogGrams(id: string, grams: number): Promise<Result> {
  if (!z.uuid().safeParse(id).success || !(grams > 0 && grams <= 5000)) return { ok: false, error: "Invalid amount" };
  const { supabase, user } = await requireUser();
  const { data: log } = await supabase.from("food_logs").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!log) return { ok: false, error: "Not found" };
  let snap;
  if (log.food_id) {
    const { data: food } = await supabase.from("foods")
      .select("kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g").eq("id", log.food_id).single();
    if (!food) return { ok: false, error: "Food not found" };
    snap = scaleFood(food, grams);
  } else {
    const k = grams / Number(log.quantity_g);
    snap = { kcal: Number(log.kcal) * k, protein_g: Number(log.protein_g) * k, carbs_g: Number(log.carbs_g) * k, fat_g: Number(log.fat_g) * k, fiber_g: Number(log.fiber_g) * k };
  }
  const { error } = await supabase.from("food_logs").update({ quantity_g: grams, ...snap }).eq("id", id);
  if (error) return { ok: false, error: "Could not update" };
  refresh();
  return { ok: true };
}

export async function deleteLog(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid item" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("food_logs").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not delete" };
  refresh();
  return { ok: true };
}

/** DASH-04: today's glasses of water. */
export async function setWater(glasses: number): Promise<Result> {
  if (!Number.isInteger(glasses) || glasses < 0 || glasses > 30) return { ok: false, error: "Invalid" };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("water_logs")
    .upsert({ user_id: user.id, log_date: todayISO(), glasses }, { onConflict: "user_id,log_date" });
  if (error) return { ok: false, error: "Could not save" };
  refresh();
  return { ok: true };
}
