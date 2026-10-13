import type { Metadata } from "next";
import Link from "next/link";
import { MealPlanWeek, RegenerateButton } from "@/components/nutrition/meal-plan";
import { PageHeader } from "@/components/shell/page-header";
import { todayISO } from "@/lib/dates";
import { loadDay } from "@/lib/food/day";
import { loadCurrentMealPlan } from "@/lib/meals/plan";
import { requireUser } from "@/lib/supabase/auth";
import { cn } from "@/lib/utils";
import { NutritionDay } from "./nutrition-day";

export const metadata: Metadata = { title: "Nutrition" };

export default async function NutritionPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const tab = view === "plan" ? "plan" : "today";
  const { supabase, user } = await requireUser();
  const today = todayISO();
  const [day, plan] = await Promise.all([loadDay(supabase, user.id, today), loadCurrentMealPlan(supabase, user.id)]);
  const todayMeals = plan?.days.find((d) => d.day === today)?.meals ?? [];

  return (
    <>
      <PageHeader eyebrow="Daily nourishment" title="Nutrition" subtitle="See how today's choices support your energy, training and recovery." />
      <nav aria-label="Nutrition views" className="mt-6 inline-flex gap-1 rounded-xl bg-nm-soft p-1">
        {([["today", "Today", "/nutrition"], ["plan", "Meal plan", "/nutrition?view=plan"]] as const).map(([k, label, href]) => (
          <Link key={k} href={href} aria-current={tab === k ? "page" : undefined}
            className={cn("min-h-10 rounded-lg px-4 py-2 text-sm font-bold", tab === k ? "bg-white shadow-card" : "text-nm-muted hover:text-nm-ink")}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === "today" ? (
        <NutritionDay day={day} plannedToday={todayMeals} />
      ) : plan ? (
        <MealPlanWeek view={plan} />
      ) : (
        <section className="mt-6 rounded-card border border-dashed border-nm-line bg-white p-8 text-center">
          <h2 className="text-xl font-black">No meal plan yet</h2>
          <p className="mx-auto mt-2 max-w-md text-nm-muted">Your coach builds a 7-day Filipino-first plan from your targets, allergies and tastes.</p>
          <div className="mt-4 flex justify-center"><RegenerateButton label="Build my plan" variant="default" /></div>
        </section>
      )}
    </>
  );
}
