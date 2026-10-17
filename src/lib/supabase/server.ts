import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

export async function createClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url!, key!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * The request's Supabase client and verified user (a round trip to Supabase Auth). Cached per request, so the layout
 * and the page share one check instead of making one each.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

/** Current user or null. Use in Server Components / Actions (Data Access Layer). */
export async function getUser() {
  await cookies(); // always render per request, even before Supabase is configured
  if (!supabaseEnv().configured) return null;
  return (await getSession()).user;
}
