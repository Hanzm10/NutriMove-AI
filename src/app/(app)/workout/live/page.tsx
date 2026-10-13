import type { Metadata } from "next";
import Link from "next/link";
import { CoachSession } from "@/components/pose/coach-session";
import { NmCard } from "@/components/shell/card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { CONSENT_VERSIONS } from "@/lib/consent/versions";
import { EXERCISE_SETUP } from "@/lib/pose/analyzers/exercises";
import { requireUser } from "@/lib/supabase/auth";
import { POSE_KIND_BY_SLUG } from "@/lib/workout/plan";
import { acceptCameraConsent } from "./actions";

export const metadata: Metadata = { title: "Camera coach" };

type Search = { exercise?: string; item?: string; sets?: string; reps?: string };

const clampInt = (v: string | undefined, lo: number, hi: number, dflt: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export default async function LiveCoachPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: consent }, { data: settings }] = await Promise.all([
    supabase.from("consents").select("id").eq("user_id", user.id).eq("type", "camera").eq("version", CONSENT_VERSIONS.camera).limit(1).maybeSingle(),
    supabase.from("user_settings").select("tts_cues").eq("user_id", user.id).maybeSingle(),
  ]);
  const slug = sp.exercise && sp.exercise in POSE_KIND_BY_SLUG ? (sp.exercise as keyof typeof POSE_KIND_BY_SLUG) : null;
  const kind = slug ? POSE_KIND_BY_SLUG[slug] : null;

  return (
    <>
      <PageHeader
        eyebrow="AI Workout · camera coach"
        title={kind ? EXERCISE_SETUP[kind].label : "Camera coach"}
        subtitle="Real-time rep counting and form cues. Video stays on this device."
      />
      <div className="mt-8">
        {!consent ? (
          <NmCard className="max-w-2xl">
            <h2 className="text-[1.777rem] leading-tight">Before we use your camera</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-nm-muted">
              <li>Your video is processed in real time on this device to track your movement.</li>
              <li>We never record, upload or store your video or photos.</li>
              <li>We only save results: rep counts, form-error counts and how long you trained.</li>
              <li>You can stop the camera at any time.</li>
            </ul>
            <form action={acceptCameraConsent} className="mt-6">
              <Button type="submit" className="h-12 rounded-xl px-6 text-base font-bold">Allow camera coach</Button>
            </form>
          </NmCard>
        ) : !kind || !slug ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {(Object.entries(POSE_KIND_BY_SLUG) as [string, keyof typeof EXERCISE_SETUP][]).map(([s, k]) => (
              <Link key={s} href={`/workout/live?exercise=${s}`} className="rounded-card border border-nm-line bg-white p-6 hover:bg-nm-soft/40">
                <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">{EXERCISE_SETUP[k].camera}</p>
                <p className="mt-2 text-xl font-bold">{EXERCISE_SETUP[k].label}</p>
                <p className="mt-1 text-sm text-nm-muted">{EXERCISE_SETUP[k].tip}</p>
              </Link>
            ))}
          </div>
        ) : (
          <CoachSession
            kind={kind}
            slug={slug}
            planItemId={sp.item && /^[0-9a-f-]{36}$/i.test(sp.item) ? sp.item : null}
            targetSets={clampInt(sp.sets, 1, 6, 2)}
            targetReps={clampInt(sp.reps, 1, 50, 10)}
            restS={60}
            voiceDefault={settings?.tts_cues ?? true}
          />
        )}
      </div>
    </>
  );
}
