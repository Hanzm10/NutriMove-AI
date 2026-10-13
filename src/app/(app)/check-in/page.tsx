import type { Metadata } from "next";
import { WhatChanged } from "@/components/agent/what-changed";
import { PageHeader } from "@/components/shell/page-header";
import { loadCheckInStatus } from "@/lib/checkin/run";
import { requireUser } from "@/lib/supabase/auth";
import { CheckInFormView } from "./check-in-form";

export const metadata: Metadata = { title: "Weekly check-in" };

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const { supabase, user } = await requireUser();
  const [status, { data: lastWeight }] = await Promise.all([
    loadCheckInStatus(supabase, user.id),
    supabase.from("weight_logs").select("weight_kg").eq("user_id", user.id).order("log_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return (
    <>
      <PageHeader eyebrow="Weekly check-in" title="How was your week?"
        subtitle="Two minutes of answers. Your coach uses them to adjust your targets and next week's plans." />
      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1fr]">
        {done && status.last ? (
          <div className="lg:col-span-2"><WhatChanged result={status.last.result} date={status.last.date} /></div>
        ) : (
          <>
            <CheckInFormView lastWeight={lastWeight ? Number(lastWeight.weight_kg) : null} />
            <section aria-label="How your coach adapts" className="h-fit rounded-card bg-nm-ink-card p-6 text-white">
              <p className="text-xs font-bold tracking-[0.12em] text-nm-accent uppercase">How your coach adapts</p>
              <ul className="mt-3 grid gap-2 text-sm text-white/85">
                <li>Your weight trend over two weeks decides whether calories change, never a single weigh-in.</li>
                <li>If your food logs are far from your target, we fix the routine first, not the target.</li>
                <li>Feeling hungry? More protein and fiber. Workouts too hard or painful? Lighter sessions.</li>
                <li>Calories never go below the safe minimum, and weight loss is capped at 1% a week.</li>
              </ul>
              {status.last && <p className="mt-4 text-xs text-white/70">Last check-in: {status.last.date}</p>}
            </section>
          </>
        )}
      </div>
    </>
  );
}
