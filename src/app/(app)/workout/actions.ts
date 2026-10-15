"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/auth";
import type { Json } from "@/lib/supabase/database.types";
import { generateWorkoutPlan } from "@/lib/workout/plan";

export async function regeneratePlan() {
  const { supabase, user } = await requireUser();
  await generateWorkoutPlan(supabase, user.id);
  revalidatePath("/workout");
  revalidatePath("/overview");
}

const setSchema = z.object({
  reps: z.number().int().min(0).max(500),
  good: z.number().int().min(0).max(500),
  errorCounts: z.record(z.string(), z.number().int().min(0)).default({}),
  durationS: z.number().min(0).max(3600).nullable().default(null),
});
const sessionSchema = z.object({
  exerciseSlug: z.string().min(1).max(60),
  planItemId: z.uuid().nullable(),
  backend: z.enum(["instanthmr", "remote", "mediapipe", "manual"]),
  avgFps: z.number().min(0).max(240).nullable().default(null),
  p50LatencyMs: z.number().min(0).max(60_000).nullable().default(null),
  p95LatencyMs: z.number().min(0).max(60_000).nullable().default(null),
  deviceClass: z.enum(["iphone", "ipad", "android", "windows", "mac", "linux", "other"]).nullable().default(null),
  startedAt: z.iso.datetime(),
  rating: z.enum(["easy", "right", "hard"]).nullable().default(null),
  sets: z.array(setSchema).min(1).max(20),
});
export type SessionInput = z.input<typeof sessionSchema>;

/** POSE-14 / WORK-03 / WORK-05: store a finished session (camera or manual). Only aggregates — never frames. */
export async function saveSession(input: SessionInput): Promise<{ ok: boolean; error?: string }> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid session data" };
  const s = parsed.data;
  const { supabase, user } = await requireUser();
  const { data: ex } = await supabase.from("exercises").select("id").eq("slug", s.exerciseSlug).single();
  if (!ex) return { ok: false, error: "Unknown exercise" };
  const { data: session, error } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: user.id,
      exercise_id: ex.id,
      plan_item_id: s.planItemId,
      started_at: s.startedAt,
      ended_at: new Date().toISOString(),
      pose_backend: s.backend,
      avg_fps: s.avgFps,
      p50_latency_ms: s.p50LatencyMs,
      p95_latency_ms: s.p95LatencyMs,
      device_class: s.deviceClass,
      rating: s.rating,
    })
    .select("id")
    .single();
  if (error || !session) return { ok: false, error: "Could not save your session" };
  const { error: setErr } = await supabase.from("session_sets").insert(
    s.sets.map((set, i) => ({
      user_id: user.id,
      session_id: session.id,
      set_idx: i,
      reps_counted: set.reps,
      reps_good: set.good,
      error_counts: set.errorCounts as Json,
      duration_s: set.durationS,
    })),
  );
  if (setErr) return { ok: false, error: "Could not save your sets" };
  revalidatePath("/workout");
  revalidatePath("/overview");
  return { ok: true };
}
