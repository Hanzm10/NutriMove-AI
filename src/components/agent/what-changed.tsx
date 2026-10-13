import { ArrowDown, ArrowRight, ArrowUp, Info, Lightbulb } from "lucide-react";
import Link from "next/link";
import type { CheckInResult } from "@/lib/checkin/run";

const fmt = (n: number) => n.toLocaleString("en-US");

function Delta({ label, before, after, unit }: { label: string; before: number; after: number; unit: string }) {
  const d = after - before;
  const Icon = d > 0 ? ArrowUp : d < 0 ? ArrowDown : ArrowRight;
  return (
    <div className="rounded-2xl bg-nm-canvas p-3">
      <p className="text-xs text-nm-muted">{label}</p>
      <p className="mt-0.5 flex items-center gap-1 font-black tabular-nums">
        {fmt(after)} {unit}
        <Icon className="size-4" aria-hidden />
        <span className="text-xs font-bold text-nm-muted">{d === 0 ? "same" : `${d > 0 ? "+" : ""}${fmt(d)}`}</span>
      </p>
      <p className="sr-only">{d === 0 ? "unchanged" : `changed from ${before} ${unit}`}</p>
    </div>
  );
}

/** AGENT-04: "What changed and why" after a weekly check-in. */
export function WhatChanged({ result, date, compact = false }: { result: CheckInResult; date: string; compact?: boolean }) {
  const workout = { progress: "One more set per exercise", regress: "One less set per exercise", none: "No change" }[result.workoutChange];
  return (
    <section aria-labelledby="changed-h" className="rounded-card border border-nm-line bg-white p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Check-in · {date}</p>
          <h2 id="changed-h" className="mt-1 text-[1.777rem] leading-tight">What changed and why</h2>
        </div>
        {result.trendPctPerWeek != null && (
          <p className="rounded-full bg-nm-soft px-3 py-1 text-sm font-bold text-nm-primary-ink">
            Weight trend {result.trendPctPerWeek > 0 ? "+" : ""}{result.trendPctPerWeek.toFixed(2)}%/week
          </p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Delta label="Calories" before={result.before.kcal} after={result.after.kcal} unit="kcal" />
        <Delta label="Protein" before={result.before.proteinG} after={result.after.proteinG} unit="g" />
        <Delta label="Carbs" before={result.before.carbsG} after={result.after.carbsG} unit="g" />
        <div className="rounded-2xl bg-nm-canvas p-3">
          <p className="text-xs text-nm-muted">Workouts</p>
          <p className="mt-0.5 font-black">{workout}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2">
        {result.reasons.map((r) => (
          <li key={r} className="flex gap-2 text-sm leading-relaxed"><Info className="mt-0.5 size-4 shrink-0 text-nm-primary-ink" aria-hidden />{r}</li>
        ))}
        {result.tips.map((t) => (
          <li key={t} className="flex gap-2 text-sm leading-relaxed"><Lightbulb className="mt-0.5 size-4 shrink-0 text-nm-warning" aria-hidden /><span><span className="font-bold">Tip: </span>{t}</span></li>
        ))}
      </ul>
      {!compact && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/nutrition?view=plan" className="inline-flex h-11 items-center rounded-xl bg-nm-ink px-5 font-bold text-white">See new meal plan</Link>
          <Link href="/workout" className="inline-flex h-11 items-center rounded-xl border border-nm-line bg-nm-soft px-5 font-bold text-nm-primary-ink">See new workouts</Link>
        </div>
      )}
      <p className="mt-3 text-xs text-nm-muted">Rules applied: {result.ruleIds.join(", ")}</p>
    </section>
  );
}
