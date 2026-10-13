import { CalendarCheck, CheckCircle2, Circle, Flame, Scale, Timer, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivityChart, CaloriesChart, WeightChart } from "@/components/progress/charts";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { loadProgress } from "@/lib/progress/load";
import type { Range } from "@/lib/progress/stats";
import { requireUser } from "@/lib/supabase/auth";
import { cn } from "@/lib/utils";
import { logWeight } from "./actions";

export const metadata: Metadata = { title: "Progress" };

const RANGES: [Range, string][] = [["7d", "7 days"], ["4w", "4 weeks"], ["3m", "3 months"]];

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: r } = await searchParams;
  const range: Range = r === "4w" || r === "3m" ? r : "7d";
  const { supabase, user } = await requireUser();
  const { summary: s, trend, latestWeight } = await loadProgress(supabase, user.id, range);
  const rangeLabel = RANGES.find(([k]) => k === range)![1].toLowerCase();
  const target = s.buckets.findLast((b) => b.targetKcal != null)?.targetKcal ?? null;
  const loggedBuckets = s.buckets.filter((b) => b.kcal != null);

  const stats = [
    { icon: CalendarCheck, label: "Consistency", value: s.consistency.planned ? `${s.consistency.done}/${s.consistency.planned}` : "—", sub: "planned workouts done" },
    { icon: Timer, label: "Active minutes", value: `${s.activeMin}`, sub: `in the last ${rangeLabel}` },
    { icon: Flame, label: "Calorie balance", value: `${s.calorieDays.within}/${s.calorieDays.total}`, sub: "days within ±10% of target" },
    { icon: Trophy, label: "Good-form reps", value: s.goodForm.pct == null ? "—" : `${s.goodForm.pct}%`, sub: s.goodForm.counted ? `${s.goodForm.good} of ${s.goodForm.counted} coached reps` : "no camera sessions yet" },
  ];

  return (
    <>
      <PageHeader eyebrow="Your momentum" title="Progress" subtitle="Notice the patterns that are making healthy routines feel natural." />
      <nav aria-label="Time range" className="mt-6 inline-flex gap-1 rounded-xl bg-nm-soft p-1">
        {RANGES.map(([k, label]) => (
          <Link key={k} href={`/progress?range=${k}`} aria-current={range === k ? "page" : undefined}
            className={cn("min-h-10 rounded-lg px-4 py-2 text-sm font-bold", range === k ? "bg-white shadow-card" : "text-nm-muted hover:text-nm-ink")}>
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, sub }) => (
          <section key={label} className="flex items-center gap-4 rounded-card border border-nm-line bg-white p-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-nm-soft"><Icon className="size-5 text-nm-primary-dark" aria-hidden /></span>
            <div className="min-w-0">
              <p className="text-sm text-nm-muted">{label}</p>
              <p className="text-2xl font-black tabular-nums">{value}</p>
              <p className="text-xs text-nm-muted">{sub}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="weight-h" className="rounded-card border border-nm-line bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Weight trend</p>
              <h2 id="weight-h" className="mt-1 text-xl font-bold">
                {latestWeight ? `${latestWeight.kg} kg` : "No weigh-ins yet"}
              </h2>
            </div>
            <form action={logWeight} className="flex items-end gap-2">
              <label className="grid gap-1 text-xs font-bold text-nm-muted" htmlFor="weight">Today (kg)
                <input id="weight" name="weight" type="number" step="0.1" min={30} max={300} required
                  className="h-11 w-24 rounded-xl border border-nm-line bg-nm-soft/60 px-3 text-base font-bold text-nm-ink" />
              </label>
              <Button type="submit" className="h-11 rounded-xl font-bold"><Scale aria-hidden /> Log</Button>
            </form>
          </div>
          <div className="mt-4"><WeightChart data={s.buckets} /></div>
          <p className="mt-2 text-sm text-nm-muted">
            {trend ? `Two-week trend: ${trend.pctPerWeek > 0 ? "+" : ""}${trend.pctPerWeek.toFixed(2)}% of body weight per week, from ${trend.points} weigh-ins. Your weekly check-in uses this.`
              : "Weigh in about once a week (or more) so your coach can see a two-week trend."}
          </p>
        </section>

        <section aria-labelledby="kcal-h" className="rounded-card border border-nm-line bg-white p-6">
          <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Calorie target adherence</p>
          <h2 id="kcal-h" className="mt-1 text-xl font-bold">{s.calorieDays.within} of {s.calorieDays.total} days on target</h2>
          <div className="mt-4"><CaloriesChart data={s.buckets} target={target} /></div>
          <p className="mt-2 text-sm text-nm-muted">
            {loggedBuckets.length
              ? `Bars show ${range === "3m" ? "weekly" : "daily"} average intake; the dashed line is your ${target ?? "—"} kcal target. You logged food on ${s.calorieDays.logged} of ${s.calorieDays.total} days.`
              : "Log meals in Nutrition to see your intake against your target."}
          </p>
        </section>

        <section aria-labelledby="act-h" className="rounded-card border border-nm-line bg-white p-6">
          <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Activity trend</p>
          <h2 id="act-h" className="mt-1 text-xl font-bold">{s.activeMin} active minutes</h2>
          <div className="mt-4"><ActivityChart data={s.buckets} /></div>
          <p className="mt-2 text-sm text-nm-muted">
            {s.activeMin ? `Most active ${range === "3m" ? "week" : "day"}: ${[...s.buckets].sort((a, b) => b.activeMin - a.activeMin)[0]!.label} (${[...s.buckets].sort((a, b) => b.activeMin - a.activeMin)[0]!.activeMin} min).` : "Finish a workout in AI Workout to start your activity trend."}
          </p>
        </section>

        <section aria-labelledby="ms-h" className="rounded-card border border-nm-line bg-white p-6">
          <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Milestones</p>
          <h2 id="ms-h" className="mt-1 text-xl font-bold">{s.milestones.filter((m) => m.achieved).length} of {s.milestones.length} reached</h2>
          <ul className="mt-4 grid gap-2">
            {s.milestones.map((m) => (
              <li key={m.id} className={cn("flex items-center gap-3 rounded-2xl p-3", m.achieved ? "bg-nm-soft" : "bg-nm-canvas")}>
                {m.achieved ? <CheckCircle2 className="size-5 shrink-0 text-nm-primary-ink" aria-hidden /> : <Circle className="size-5 shrink-0 text-nm-muted" aria-hidden />}
                <div className="min-w-0">
                  <p className="font-bold">{m.title} <span className="sr-only">{m.achieved ? "(reached)" : "(not yet)"}</span></p>
                  <p className="text-xs text-nm-muted">{m.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/check-in" className="mt-4 inline-flex h-11 items-center rounded-xl border border-nm-line bg-nm-soft px-5 font-bold text-nm-primary-ink">Weekly check-in</Link>
        </section>
      </div>
    </>
  );
}
