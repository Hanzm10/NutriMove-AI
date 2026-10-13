import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Where a signed-in user must go before the app shell: consent → onboarding → app. */
export async function getGate(supabase: SupabaseClient<Database>, userId: string) {
  const [{ data: consents }, { data: profile }] = await Promise.all([
    supabase.from("consents").select("type").eq("user_id", userId).in("type", ["data", "health"]),
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  const types = new Set((consents ?? []).map((c) => c.type));
  const consented = types.has("data") && types.has("health");
  return {
    consented,
    onboarded: Boolean(profile?.onboarding_completed_at),
    profile,
  };
}
