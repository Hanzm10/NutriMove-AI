"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runCheckIn } from "@/lib/checkin/run";
import { requireUser } from "@/lib/supabase/auth";

const schema = z.object({
  weightKg: z.number().min(30).max(300),
  adherence: z.number().int().min(1).max(5),
  hunger: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  difficulty: z.enum(["easy", "right", "hard"]),
  newPain: z.boolean(),
});
export type CheckInForm = z.input<typeof schema>;

/** AGENT-02/04: weekly check-in → adaptation → new targets and plans. */
export async function submitCheckIn(input: CheckInForm): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please answer every question (weight 30–300 kg)." };
  const { supabase, user } = await requireUser();
  try {
    await runCheckIn(supabase, user.id, parsed.data);
  } catch (e) {
    console.error("check-in failed", e);
    return { ok: false, error: e instanceof Error && e.message.includes("onboarding") ? e.message : "Could not save your check-in. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Clears the post-pain pause once the user confirms they're pain-free. */
export async function resumeCameraCoach(): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("adapt_state").eq("user_id", user.id).single();
  const state = { ...((profile?.adapt_state ?? {}) as Record<string, unknown>), posePaused: false };
  const { error } = await supabase.from("profiles").update({ adapt_state: state }).eq("user_id", user.id);
  revalidatePath("/", "layout");
  return { ok: !error };
}
