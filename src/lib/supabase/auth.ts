import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "./server";

/** Supabase client + signed-in user, or redirect to /login. Use in Server Components and Actions. */
export async function requireUser() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");
  return { supabase, user };
}
