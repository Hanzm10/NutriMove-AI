"use server";

import { redirect } from "next/navigation";
import { CONSENT_VERSIONS } from "@/lib/consent/versions";
import { createClient } from "@/lib/supabase/server";

export type ConsentState = { error?: string };

export async function acceptConsent(_: ConsentState, form: FormData): Promise<ConsentState> {
  if (form.get("data") !== "on" || form.get("health") !== "on") {
    return { error: "Please accept both items to continue." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("consents").insert([
    { user_id: user.id, type: "data", version: CONSENT_VERSIONS.data },
    { user_id: user.id, type: "health", version: CONSENT_VERSIONS.health },
  ]);
  if (error) return { error: "Could not save your consent. Please try again." };
  redirect("/overview"); // → /onboarding once ONB-* lands (Day 2)
}
