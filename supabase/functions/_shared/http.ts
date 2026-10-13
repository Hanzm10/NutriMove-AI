// Shared helpers for NutriMove Edge Functions (Deno).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

/** Signed-in user from the request's JWT, or null. */
export async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await client.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  return data.user?.id ?? null;
}

/** Service-role client: bypasses RLS. Use only for catalogue writes and counters. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Fixed-window per-user limit (PRD §9.4: 60 requests/minute). Returns false when over the limit. */
export async function withinRateLimit(db: SupabaseClient, userId: string, bucket: string, limit = 60) {
  const windowStart = new Date();
  windowStart.setSeconds(0, 0);
  const key = { user_id: userId, bucket, window_start: windowStart.toISOString() };
  const { data } = await db.from("api_usage").select("count").match(key).maybeSingle();
  const count = (data?.count ?? 0) + 1;
  await db.from("api_usage").upsert({ ...key, count }, { onConflict: "user_id,bucket,window_start" });
  return count <= limit;
}

export async function readJson<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}
