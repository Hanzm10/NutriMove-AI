import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./server";

/** Supabase client + signed-in user, or redirect to /login. Use in Server Components and Actions. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
