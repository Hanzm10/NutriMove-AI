import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { weightTrend } from "@/lib/agent/adaptation";
import { addDaysISO, todayISO } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import { RANGE_DAYS, summarize, type DayInput, type Range } from "./stats";

type DB = SupabaseClient<Database>;
const HISTORY_DAYS = RANGE_DAYS["3m"];

const manilaDate = (ts: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));

/** DASH-02: everything the Progress screen needs for one range. */
export async function loadProgress(supabase: DB, userId: string, range: Range) {
  const today = todayISO();
  const from = addDaysISO(today, -(HISTORY_DAYS - 1));
  const [{ data: logs }, { data: targets }, { data: plans }, { data: sessions }, { data: water }, { data: weights }, { count: checkIns }] = await Promise.all([
    supabase.from("food_logs").select("log_date, kcal, protein_g").eq("user_id", userId).gte("log_date", from),
    supabase.from("targets").select("effective_from, created_at, kcal, protein_g").eq("user_id", userId).order("effective_from").order("created_at"),
    supabase.from("workout_plans").select("id, week_start, created_at, workout_plan_items(day)").eq("user_id", userId)
      .gte("week_start", addDaysISO(from, -7)).order("created_at"),
    supabase.from("workout_sessions").select("started_at, session_sets(duration_s, reps_counted, reps_good)").eq("user_id", userId),
    supabase.from("water_logs").select("log_date, glasses").eq("user_id", userId).gte("log_date", from),
    supabase.from("weight_logs").select("log_date, weight_kg").eq("user_id", userId).gte("log_date", from).order("log_date"),
    supabase.from("check_ins").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  // Latest plan created that covers each day decides whether the day was a training day.
  const plannedBy = new Map<string, boolean>();
  for (const p of plans ?? []) {
    const days = new Set((p.workout_plan_items ?? []).map((i) => i.day));
    for (let i = 0; i < 7; i++) {
      const d = addDaysISO(p.week_start, i);
      plannedBy.set(d, days.has(d));
    }
  }
  const food = new Map<string, { kcal: number; protein: number }>();
  for (const l of logs ?? []) {
    const f = food.get(l.log_date) ?? { kcal: 0, protein: 0 };
    food.set(l.log_date, { kcal: f.kcal + Number(l.kcal), protein: f.protein + Number(l.protein_g) });
  }
  const sess = new Map<string, { min: number; counted: number; good: number }>();
  let goodRepsAllTime = 0;
  for (const s of sessions ?? []) {
    const sets = s.session_sets ?? [];
    goodRepsAllTime += sets.reduce((a, x) => a + x.reps_good, 0);
    const d = manilaDate(s.started_at);
    if (d < from) continue;
    const secs = sets.reduce((a, x) => a + Number(x.duration_s ?? 0), 0) || 120; // manual logs ≈ 2 min
    const cur = sess.get(d) ?? { min: 0, counted: 0, good: 0 };
    sess.set(d, {
      min: cur.min + secs / 60,
      counted: cur.counted + sets.reduce((a, x) => a + x.reps_counted, 0),
      good: cur.good + sets.reduce((a, x) => a + x.reps_good, 0),
    });
  }
  const waterBy = new Map((water ?? []).map((w) => [w.log_date, w.glasses]));
  const targetOn = (d: string) => {
    let t: { kcal: number; protein_g: number } | null = null;
    for (const row of targets ?? []) if (row.effective_from <= d) t = row;
    return t;
  };

  const days: DayInput[] = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const date = addDaysISO(from, i);
    const f = food.get(date);
    const s = sess.get(date);
    const t = targetOn(date);
    return {
      date,
      kcal: f?.kcal ?? 0,
      proteinG: f?.protein ?? 0,
      targetKcal: t?.kcal ?? null,
      targetProteinG: t?.protein_g ?? null,
      activeMin: s?.min ?? 0,
      workoutDone: Boolean(s),
      workoutPlanned: plannedBy.get(date) ?? false,
      repsCounted: s?.counted ?? 0,
      repsGood: s?.good ?? 0,
      water: waterBy.get(date) ?? 0,
      logged: Boolean(f),
    };
  });
  const w = (weights ?? []).map((x) => ({ date: x.log_date, kg: Number(x.weight_kg) }));
  return {
    range,
    today,
    summary: summarize(range, today, days, w, { goodRepsAllTime, checkIns: checkIns ?? 0 }),
    trend: weightTrend(w, today),
    latestWeight: w.at(-1) ?? null,
  };
}

export type ProgressView = Awaited<ReturnType<typeof loadProgress>>;
