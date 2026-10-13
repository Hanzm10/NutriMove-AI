"use client";

import { Check, ChefHat, ChevronDown, Loader2, RefreshCw, Shuffle, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { logPlannedMeal, rateRecipe, regenerateMealPlan, swapMeal } from "@/app/(app)/nutrition/meal-actions";
import { Button } from "@/components/ui/button";
import { weekdayLabel } from "@/lib/dates";
import type { MealPlanView, PlanMeal } from "@/lib/meals/plan";
import { cn } from "@/lib/utils";

export const SLOT_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" } as const;

type Res = { ok: true; message?: string } | { ok: false; error: string };
function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Res>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else if (r.message) toast.success(r.message);
    });
  return [pending, run] as const;
}

export function RegenerateButton({ label = "New plan", variant = "outline", className }: { label?: string; variant?: "outline" | "default"; className?: string }) {
  const [pending, run] = useAction();
  return (
    <Button variant={variant} className={cn("h-11 rounded-xl px-4 font-bold", className)} disabled={pending} onClick={() => run(regenerateMealPlan)}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} {label}
    </Button>
  );
}

/** MEAL-01…04: 7-day view with day picker, meal cards, swap, ratings and log. */
export function MealPlanWeek({ view }: { view: MealPlanView }) {
  const initial = view.days.find((d) => d.day === view.today)?.day ?? view.days[0]?.day ?? view.today;
  const [selected, setSelected] = useState(initial);
  const day = view.days.find((d) => d.day === selected) ?? view.days[0];
  const reasons = ((view.plan.explanation ?? {}) as { reasons?: string[] }).reasons ?? [];
  const off = day && view.targetKcal ? Math.round(((day.kcal - view.targetKcal) / view.targetKcal) * 100) : null;

  return (
    <div className="mt-6 grid gap-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-card bg-nm-ink-card p-6 text-white" aria-labelledby="plan-h">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[0.12em] text-nm-accent uppercase">Your 7-day meal plan</p>
          <h2 id="plan-h" className="mt-1 text-[1.777rem] leading-tight">Built around {view.targetKcal?.toLocaleString() ?? "your"} kcal a day</h2>
          <ul className="mt-3 grid gap-1 text-sm text-white/85">
            {reasons.map((r) => <li key={r} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-nm-accent" aria-hidden />{r}</li>)}
          </ul>
        </div>
        <RegenerateButton className="border-white/30 bg-white text-nm-ink hover:bg-nm-soft" />
      </section>

      <nav aria-label="Plan days" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {view.days.map((d) => {
          const active = d.day === selected;
          return (
            <button key={d.day} onClick={() => setSelected(d.day)} aria-current={active ? "date" : undefined}
              className={cn("min-w-20 shrink-0 rounded-2xl border px-3 py-2 text-left", active ? "border-nm-ink bg-nm-ink text-white" : "border-nm-line bg-white hover:bg-nm-soft")}>
              <span className="block text-xs font-bold uppercase">{d.day === view.today ? "Today" : weekdayLabel(d.day)}</span>
              <span className={cn("block text-sm tabular-nums", active ? "text-white/80" : "text-nm-muted")}>{d.kcal.toLocaleString()} kcal</span>
            </button>
          );
        })}
      </nav>

      {day && (
        <section aria-labelledby="day-h" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="day-h" className="text-xl font-black">{weekdayLabel(day.day, "long")}, {day.day}</h2>
            <p className="text-sm text-nm-muted">
              <span className="font-bold text-nm-ink">{day.kcal.toLocaleString()} kcal</span> · {day.proteinG} g protein
              {off !== null && <> · {off === 0 ? "on target" : `${off > 0 ? "+" : ""}${off}% vs target`}</>}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {day.meals.map((m) => <PlannedMealCard key={m.id} meal={m} today={view.today} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export function PlannedMealCard({ meal, today, compact = false }: { meal: PlanMeal; today: string; compact?: boolean }) {
  const [pending, run] = useAction();
  const [open, setOpen] = useState(false);
  const r = meal.recipe;
  const future = meal.day > today;
  const detailsId = `recipe-${meal.id}`;
  return (
    <article className={cn("flex flex-col rounded-card border border-nm-line bg-white", compact ? "p-4" : "p-5")} aria-busy={pending}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-nm-soft text-nm-primary-ink" aria-hidden><ChefHat className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">
            {SLOT_LABEL[meal.slot]}{r.is_filipino && " · Filipino"}
          </p>
          <h3 className="mt-0.5 text-lg leading-snug font-black">{r.name}</h3>
          <p className="mt-1 text-sm text-nm-muted">
            {meal.servings === 1 ? "1 serving" : `${meal.servings} servings`} · <span className="font-bold text-nm-ink">{meal.kcal} kcal</span> · P {meal.proteinG} g · C {meal.carbsG} g · F {meal.fatG} g
          </p>
        </div>
      </div>

      {meal.why.length > 0 && (
        <div className="mt-3 rounded-xl bg-nm-soft/70 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase"><Sparkles className="size-3.5" aria-hidden /> Why this</p>
          <ul className="mt-1 grid gap-0.5 text-sm">
            {meal.why.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      {!compact && (
        <>
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={detailsId}
            className="mt-3 flex items-center gap-1 self-start text-sm font-bold text-nm-primary-ink hover:underline">
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden /> Recipe
          </button>
          {open && (
            <div id={detailsId} className="mt-2 grid gap-2 text-sm">
              <ul className="grid gap-0.5">
                {r.ingredients.map((i) => (
                  <li key={i.name} className="flex justify-between gap-2 border-b border-dashed border-nm-line py-0.5">
                    <span>{i.name}</span><span className="tabular-nums text-nm-muted">{Math.round(i.grams * meal.servings)} g</span>
                  </li>
                ))}
              </ul>
              <p>{r.instructions}</p>
              <p className="text-xs text-nm-muted">{r.prep_minutes ? `About ${r.prep_minutes} min. ` : ""}{r.source_ref}.</p>
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {meal.logged ? (
          <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-nm-soft px-3 text-sm font-bold text-nm-primary-ink"><Check className="size-4" aria-hidden /> Logged</span>
        ) : (
          <Button className="h-10 rounded-xl px-4 font-bold" disabled={pending || future} onClick={() => run(() => logPlannedMeal(meal.id))}
            title={future ? "You can log this on its day" : undefined}>
            <Check aria-hidden /> Log
          </Button>
        )}
        <Button variant="outline" className="h-10 rounded-xl px-4 font-bold" disabled={pending || meal.logged} onClick={() => run(() => swapMeal(meal.id))}
          aria-label={`Swap ${r.name} for another ${SLOT_LABEL[meal.slot].toLowerCase()}`}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Shuffle aria-hidden />} Swap
        </Button>
        <div className="ml-auto flex gap-1" role="group" aria-label={`Rate ${r.name}`}>
          <Button variant="ghost" size="icon" className={cn("rounded-xl", meal.rating === 1 && "bg-nm-soft text-nm-primary-ink")} aria-pressed={meal.rating === 1}
            aria-label="I like this" disabled={pending} onClick={() => run(() => rateRecipe({ recipeId: r.id, rating: meal.rating === 1 ? 0 : 1 }))}>
            <ThumbsUp className={cn(meal.rating === 1 && "fill-current")} aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className={cn("rounded-xl", meal.rating === -1 && "bg-nm-soft text-nm-danger")} aria-pressed={meal.rating === -1}
            aria-label="Not for me" disabled={pending} onClick={() => run(() => rateRecipe({ recipeId: r.id, rating: meal.rating === -1 ? 0 : -1 }))}>
            <ThumbsDown className={cn(meal.rating === -1 && "fill-current")} aria-hidden />
          </Button>
        </div>
      </div>
    </article>
  );
}
