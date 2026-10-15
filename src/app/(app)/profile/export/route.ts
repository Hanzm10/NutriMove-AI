import { NextResponse } from "next/server";
import { todayISO } from "@/lib/dates";
import { createClient, getUser } from "@/lib/supabase/server";

const TABLES = [
  "profiles", "user_settings", "consents", "screenings", "targets", "food_logs", "water_logs", "weight_logs",
  "recipe_ratings", "meal_plans", "meal_plan_items", "workout_plans", "workout_plan_items", "workout_sessions",
  "session_sets", "check_ins", "agent_events", "survey_responses",
] as const;

/** AUTH-05: everything we store about the signed-in user, as one JSON download. RLS scopes every query. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const supabase = await createClient();
  const data: Record<string, unknown> = {};
  for (const t of TABLES) {
    const { data: rows } = await supabase.from(t).select("*").eq("user_id", user.id);
    data[t] = rows ?? [];
  }
  const body = JSON.stringify({ exported_at: new Date().toISOString(), account: { id: user.id, email: user.email }, note: "Camera video is never stored, so it is not part of this export.", data }, null, 2);
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="nutrimove-data-${todayISO()}.json"`,
      "cache-control": "no-store",
    },
  });
}
