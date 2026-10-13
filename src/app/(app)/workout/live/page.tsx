import type { Metadata } from "next";
import { LiveCoach } from "@/components/pose/live-coach";
import { NmCard } from "@/components/shell/card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { CONSENT_VERSIONS } from "@/lib/consent/versions";
import { requireUser } from "@/lib/supabase/auth";
import { acceptCameraConsent } from "./actions";

export const metadata: Metadata = { title: "Camera coach" };

export default async function LiveCoachPage() {
  const { supabase, user } = await requireUser();
  const { data: consent } = await supabase
    .from("consents")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "camera")
    .eq("version", CONSENT_VERSIONS.camera)
    .limit(1)
    .maybeSingle();

  return (
    <>
      <PageHeader
        eyebrow="AI Workout · camera coach"
        title="Live tracking"
        subtitle="Your skeleton is tracked in real time. Rep counting and form cues for squats, push-ups and lunges arrive next."
      />
      <div className="mt-8">
        {consent ? (
          <LiveCoach />
        ) : (
          <NmCard className="max-w-2xl">
            <h2 className="text-[1.777rem] leading-tight">Before we use your camera</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-nm-muted">
              <li>Your video is processed in real time on this device to track your movement.</li>
              <li>We never record, upload or store your video or photos.</li>
              <li>We only save results: rep counts, form-error counts and how long you trained.</li>
              <li>You can stop the camera at any time.</li>
            </ul>
            <form action={acceptCameraConsent} className="mt-6">
              <Button type="submit" className="h-12 rounded-xl px-6 text-base font-bold">
                Allow camera coach
              </Button>
            </form>
          </NmCard>
        )}
      </div>
    </>
  );
}
