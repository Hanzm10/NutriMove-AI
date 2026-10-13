"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { todayISO } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/auth";

/** Weigh-ins between check-ins sharpen the AGENT-03 trend. One entry per day (latest wins). */
export async function logWeight(formData: FormData): Promise<void> {
  const kg = z.coerce.number().min(30).max(300).safeParse(formData.get("weight"));
  if (!kg.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("weight_logs").upsert({ user_id: user.id, log_date: todayISO(), weight_kg: kg.data }, { onConflict: "user_id,log_date" });
  revalidatePath("/progress");
}
