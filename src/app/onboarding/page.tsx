import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shell/logo";
import { getGate } from "@/lib/onboarding/state";
import type { DietForm } from "@/lib/onboarding/schema";
import { requireUser } from "@/lib/supabase/auth";
import { OnboardingWizard, type WizardInitial } from "./wizard";

export const metadata: Metadata = { title: "Set up your plan" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ redo?: string }> }) {
  const { supabase, user } = await requireUser();
  const gate = await getGate(supabase, user.id);
  if (!gate.consented) redirect("/consent");
  const { redo } = await searchParams;
  if (gate.onboarded && !redo) redirect("/overview");

  const p = gate.profile;
  const { data: screening } = await supabase
    .from("screenings")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const num = (v: number | null | undefined) => (v == null ? undefined : Number(v));
  const initial: WizardInitial = {
    step: redo ? 0 : (p?.onboarding_step ?? 0),
    screening: {
      birthdate: p?.birthdate ?? undefined,
      sex: (p?.sex as "male" | "female" | null) ?? undefined,
      pregnantOrBreastfeeding: screening?.pregnant_or_bf ?? false,
      parq: (screening?.parq as WizardInitial["screening"]["parq"]) ?? undefined,
      clearanceAck: screening?.clearance_ack ?? false,
    },
    body: {
      heightCm: num(p?.height_cm),
      weightKg: num(p?.weight_kg),
      targetWeightKg: num(p?.target_weight_kg) ?? null,
    },
    goal: {
      goal: (p?.goal as WizardInitial["goal"]["goal"]) ?? undefined,
      activity: (p?.activity_level as WizardInitial["goal"]["activity"]) ?? undefined,
    },
    training: {
      experience: (p?.experience_level as "beginner" | "intermediate" | null) ?? undefined,
      equipment: p?.equipment?.length ? (p.equipment as WizardInitial["training"]["equipment"]) : undefined,
      daysPerWeek: p?.days_per_week ?? undefined,
      minutesPerSession: p?.minutes_per_session ?? undefined,
    },
    diet: (p?.diet_prefs as Partial<DietForm> | null) ?? {},
  };

  return (
    <div className="min-h-dvh bg-nm-canvas px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Logo href="/" />
        <main id="main" className="mt-10 rounded-card border border-nm-line bg-white/60 p-5 sm:p-10">
          <OnboardingWizard initial={initial} />
        </main>
        <p className="mt-6 text-xs text-nm-muted">
          NutriMove AI is not a medical device and does not give medical advice.
        </p>
      </div>
    </div>
  );
}
