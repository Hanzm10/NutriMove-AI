"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/auth";
import { generateWorkoutPlan } from "@/lib/workout/plan";

const settingsSchema = z.object({
  larger_text: z.boolean(),
  high_contrast: z.boolean(),
  reduce_motion: z.boolean(),
  tts_cues: z.boolean(),
  water_goal: z.number().int().min(1).max(20),
});

/** Profile → Accessibility & daily goals (§8.4, DASH-04). */
export async function saveSettings(input: z.input<typeof settingsSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your settings." };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("user_settings").upsert({ user_id: user.id, ...parsed.data, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/", "layout");
  return { ok: true };
}

const scheduleSchema = z.object({
  display_name: z.string().trim().min(1).max(60),
  days_per_week: z.number().int().min(2).max(6),
  minutes_per_session: z.number().int().refine((n) => [15, 20, 30, 45, 60].includes(n)),
});

/** Name and training schedule; schedule changes regenerate the workout plan (PRD §10.3). */
export async function saveProfile(input: z.input<typeof scheduleSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your entries." };
  const { supabase, user } = await requireUser();
  const { data: before } = await supabase.from("profiles").select("days_per_week, minutes_per_session").eq("user_id", user.id).single();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not save." };
  if (before?.days_per_week !== parsed.data.days_per_week || before?.minutes_per_session !== parsed.data.minutes_per_session) {
    try { await generateWorkoutPlan(supabase, user.id); } catch (e) { console.error("plan regen failed", e); }
  }
  await supabase.auth.updateUser({ data: { full_name: parsed.data.display_name } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** AUTH-04: delete the account and (by cascade) every row that belongs to it. */
export async function deleteAccount(confirm: string): Promise<{ ok: false; error: string } | never> {
  if (confirm.trim().toUpperCase() !== "DELETE") return { ok: false, error: 'Type DELETE to confirm.' };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    console.error("delete_my_account failed", error);
    return { ok: false, error: "Account deletion isn't available yet. Please contact the team." };
  }
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
