"use server";

import { revalidatePath } from "next/cache";
import { CONSENT_VERSIONS } from "@/lib/consent/versions";
import { requireUser } from "@/lib/supabase/auth";

/** AUTH-03: camera consent before the first camera session. */
export async function acceptCameraConsent() {
  const { supabase, user } = await requireUser();
  await supabase.from("consents").insert({ user_id: user.id, type: "camera", version: CONSENT_VERSIONS.camera });
  revalidatePath("/workout/live");
}
