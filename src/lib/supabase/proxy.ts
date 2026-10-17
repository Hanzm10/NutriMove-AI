import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth", "/privacy", "/dev"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

/** Refreshes the Supabase session cookie and redirects signed-out users to /login. */
export async function updateSession(request: NextRequest) {
  const { url, key, configured } = supabaseEnv();
  let response = NextResponse.next({ request });
  if (!configured) return response; // lets the UI run before Supabase is set up

  const supabase = createServerClient<Database>(url!, key!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not put code between createServerClient and the auth call (Supabase SSR guidance). getClaims refreshes an
  // expired session like getUser does, but verifies the token's signature locally (ES256, public keys cached for
  // 10 min) instead of a round trip to Supabase Auth on every navigation. Pages still verify with getUser.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;

  const { pathname } = request.nextUrl;
  if (!signedIn && !isPublic(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    // Keep the query (e.g. a laptop-coach pairing link) so it survives signing in; safeNext still only allows local paths.
    login.search = "";
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return response;
}
