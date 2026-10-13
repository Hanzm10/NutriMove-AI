import type { Metadata } from "next";
import { NmCard, Eyebrow } from "@/components/shell/card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/supabase/auth";
import { loadCurrentPlan } from "@/lib/workout/plan";
import { regeneratePlan } from "./actions";
import { WorkoutToday } from "./workout-today";

export const metadata: Metadata = { title: "AI Workout" };

export default async function WorkoutPage() {
  const { supabase, user } = await requireUser();
  const view = await loadCurrentPlan(supabase, user.id);
  const reasons = ((view?.plan.explanation as { reasons?: string[] } | null)?.reasons ?? []) as string[];

  return (
    <>
      <PageHeader
        eyebrow="Personalized movement"
        title="AI Workout"
        subtitle="A guided plan built around your goals, energy and experience."
      />
      {view ? (
        <WorkoutToday view={view} reasons={reasons} />
      ) : (
        <NmCard className="mt-8 max-w-2xl">
          <Eyebrow>WORK-01</Eyebrow>
          <h2 className="mt-2 text-[1.777rem] leading-tight">Let&apos;s build your weekly plan</h2>
          <p className="mt-2 text-nm-muted">We&apos;ll use your goal, schedule, equipment and health answers.</p>
          <form action={regeneratePlan} className="mt-6">
            <Button type="submit" className="h-12 rounded-xl px-6 text-base font-bold">Generate my plan</Button>
          </form>
        </NmCard>
      )}
    </>
  );
}
