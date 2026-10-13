"use client";

import { Droplet, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { AddFoodSheet } from "@/components/nutrition/add-food-sheet";
import { EnergyRing, MacroBar } from "@/components/nutrition/energy-ring";
import { Button } from "@/components/ui/button";
import { weekdayLabel } from "@/lib/dates";
import type { DayData } from "@/lib/food/day";
import { MEAL_SLOTS, slotForHour, type MealSlot } from "@/lib/food/nutrition";
import { deleteLog, setWater, updateLogGrams } from "./actions";

const SLOT = { breakfast: ["B", "Breakfast"], lunch: ["L", "Lunch"], dinner: ["D", "Dinner"], snack: ["S", "Snack"] } as const;

export function NutritionDay({ day }: { day: DayData }) {
  const [sheet, setSheet] = useState<{ open: boolean; slot: MealSlot }>({ open: false, slot: "breakfast" });
  const t = day.targets;
  const remaining = t ? t.kcal - day.totals.kcal : 0;
  const openAdd = (slot?: MealSlot) =>
    setSheet({ open: true, slot: slot ?? slotForHour(Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }).format(new Date()))) });

  return (
    <div className="mt-8 grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr_0.8fr]">
        <section className="flex flex-wrap items-center gap-6 rounded-card border border-nm-line bg-white p-6" aria-labelledby="energy-h">
          <EnergyRing value={day.totals.kcal} target={t?.kcal ?? 0} />
          <div className="min-w-40 flex-1">
            <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Daily energy</p>
            <h2 id="energy-h" className="mt-1 text-[1.777rem] leading-tight">
              {!t ? "No target yet" : remaining >= 0 ? `${remaining.toLocaleString()} kcal remaining` : `${Math.abs(remaining).toLocaleString()} kcal over`}
            </h2>
            <p className="mt-2 text-sm text-nm-muted">
              {!t ? "Finish onboarding to get your daily target."
                : remaining < 0 ? "That's okay. Choose lighter, high-fibre options for the rest of today."
                : day.totals.protein_g < (t.protein_g * 0.5) ? "Prioritise protein and vegetables in your next meal."
                : "You're on track."}
            </p>
          </div>
        </section>
        <section className="grid gap-4 rounded-card border border-nm-line bg-white p-6" aria-labelledby="macro-h">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Macronutrients</p>
            <h2 id="macro-h" className="mt-1 text-xl">Today&apos;s balance</h2>
          </div>
          <MacroBar label="Protein" value={day.totals.protein_g} target={t?.protein_g ?? 0} color="bg-nm-primary" />
          <MacroBar label="Carbs" value={day.totals.carbs_g} target={t?.carbs_g ?? 0} color="bg-nm-info" />
          <MacroBar label="Fat" value={day.totals.fat_g} target={t?.fat_g ?? 0} color="bg-nm-ink-card" />
        </section>
        <Hydration glasses={day.water} goal={day.waterGoal} />
      </div>

      <section className="rounded-card border border-nm-line bg-white p-6 sm:p-7" aria-labelledby="meals-h">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">{weekdayLabel(day.date, "long")}, {day.date}</p>
            <h2 id="meals-h" className="mt-1 text-[1.777rem] leading-tight">Today&apos;s meals</h2>
          </div>
          <Button onClick={() => openAdd()} className="h-12 rounded-xl px-5 font-bold shadow-card"><Plus aria-hidden /> Add meal</Button>
        </div>
        <div className="mt-5 divide-y divide-nm-line border-t border-nm-line">
          {MEAL_SLOTS.map((slot) => {
            const items = day.logs.filter((l) => l.meal_slot === slot);
            const kcal = Math.round(items.reduce((a, l) => a + l.kcal, 0));
            return (
              <div key={slot} className="py-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-nm-soft font-bold text-nm-primary-ink" aria-hidden>{SLOT[slot][0]}</span>
                  <h3 className="flex-1 text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">{SLOT[slot][1]}</h3>
                  {items.length > 0 && <span className="text-sm font-bold">{kcal} kcal</span>}
                  <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => openAdd(slot)} aria-label={`Add to ${SLOT[slot][1]}`}><Plus aria-hidden /></Button>
                </div>
                {items.length === 0 ? (
                  <button onClick={() => openAdd(slot)} className="mt-2 ml-13 text-sm text-nm-muted hover:text-nm-ink">Add {SLOT[slot][1].toLowerCase()}</button>
                ) : (
                  <ul className="mt-2 grid gap-1 pl-13">
                    {items.map((l) => <LogRow key={l.id} log={l} />)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <AddFoodSheet open={sheet.open} slot={sheet.slot} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} />
    </div>
  );
}

function LogRow({ log }: { log: DayData["logs"][number] }) {
  const [editing, setEditing] = useState(false);
  const [grams, setGrams] = useState(log.quantity_g);
  const [pending, start] = useTransition();
  const quick = !log.food_id;
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl py-1">
      <div className="min-w-0 flex-1">
        <p className="font-bold">{log.name}</p>
        <p className="text-xs text-nm-muted">
          {!quick && `${Math.round(log.quantity_g)} g · `}{Math.round(log.protein_g)}g protein · {Math.round(log.carbs_g)}g carbs · {Math.round(log.fat_g)}g fat
        </p>
      </div>
      {editing ? (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await updateLogGrams(log.id, grams); if (r.ok) setEditing(false); else toast.error(r.error); }); }}>
          <label className="sr-only" htmlFor={`g-${log.id}`}>Grams</label>
          <input id={`g-${log.id}`} type="number" min={1} max={5000} value={grams} onChange={(e) => setGrams(Number(e.target.value))} className="h-9 w-20 rounded-lg border border-nm-line px-2" />
          <Button type="submit" size="sm" disabled={pending}>Save</Button>
        </form>
      ) : (
        <span className="text-sm font-bold tabular-nums">{Math.round(log.kcal)} <span className="font-normal text-nm-muted">kcal</span></span>
      )}
      {!quick && !editing && (
        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label={`Edit amount of ${log.name}`}><Pencil aria-hidden /></Button>
      )}
      <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Delete ${log.name}`}
        onClick={() => start(async () => { const r = await deleteLog(log.id); if (!r.ok) toast.error(r.error); })}>
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}

function Hydration({ glasses, goal }: { glasses: number; goal: number }) {
  const [optimistic, setOptimistic] = useOptimistic(glasses);
  const [, start] = useTransition();
  const change = (d: number) => {
    const next = Math.max(0, Math.min(30, optimistic + d));
    start(async () => { setOptimistic(next); const r = await setWater(next); if (!r.ok) toast.error(r.error); });
  };
  return (
    <section className="flex flex-col justify-between rounded-card bg-nm-ink-card p-6 text-white" aria-labelledby="water-h">
      <span className="grid size-11 place-items-center rounded-xl bg-white/10"><Droplet className="size-5 text-nm-accent" aria-hidden /></span>
      <div className="mt-4">
        <p className="text-xs font-bold tracking-[0.12em] text-nm-accent uppercase">Hydration</p>
        <h2 id="water-h" className="mt-1 text-xl" aria-live="polite">{optimistic} of {goal} glasses</h2>
        <p className="text-sm text-white/80">{optimistic >= goal ? "Goal reached. Nice!" : `${goal - optimistic} more to reach your daily goal.`}</p>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button variant="outline" size="icon" className="rounded-full border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => change(-1)} aria-label="Remove a glass"><Minus aria-hidden /></Button>
        <div className="flex flex-1 gap-1" aria-hidden>
          {Array.from({ length: goal }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < optimistic ? "bg-nm-primary" : "bg-white/20"}`} />)}
        </div>
        <Button variant="outline" size="icon" className="rounded-full border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => change(1)} aria-label="Add a glass"><Plus aria-hidden /></Button>
      </div>
    </section>
  );
}
