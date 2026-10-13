import { ArrowRight, ClipboardCheck, Clock, Droplet, Flame, ShieldAlert, Sparkles, Target, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { WhatChanged } from "@/components/agent/what-changed";
import { EnergyRing } from "@/components/nutrition/energy-ring";
import { PageHeader } from "@/components/shell/page-header";
import { dailyNudge } from "@/lib/agent/nudges";
import { loadCheckInStatus } from "@/lib/checkin/run";
import { addDaysISO, todayISO, weekdayLabel } from "@/lib/dates";
import { loadDay } from "@/lib/food/day";
import { percentOf } from "@/lib/food/nutrition";
import { requireUser } from "@/lib/supabase/auth";
import { estimateSessionMinutes } from "@/lib/workout/estimate";
import { loadCurrentPlan } from "@/lib/workout/plan";

export const metadata: Metadata = { title: "Overview" };

function manilaHour() {
  return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }).format(new Date())) % 24;
}

export default async function OverviewPage() {
  const { supabase, user } = await requireUser();
  const today = todayISO();
  const [day, plan, { data: profile }, { data: sessions }, checkIn] = await Promise.all([
    loadDay(supabase, user.id, today),
    loadCurrentPlan(supabase, user.id),
    supabase.from("profiles").select("display_name, experience_level").eq("user_id", user.id).single(),
    supabase.from("workout_sessions").select("id, started_at, ended_at, session_sets(duration_s)").eq("user_id", user.id)
      .gte("started_at", `${today}T00:00:00+08:00`).lt("started_at", `${addDaysISO(today, 1)}T00:00:00+08:00`),
    loadCheckInStatus(supabase, user.id),
  ]);
  const recentCheckIn = checkIn.last && checkIn.last.date >= addDaysISO(today, -6) ? checkIn.last : null;
  const hour = manilaHour();
  const first = (profile?.display_name ?? "there").split(" ")[0];
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const todayPlan = plan?.days.find((d) => d.day === today);
  const nextPlan = plan?.days.find((d) => d.day > today);
  const focus = (plan?.plan.explanation as { focus?: string[] } | null)?.focus;
  const todayFocus = todayPlan && plan ? focus?.[plan.days.indexOf(todayPlan)] : null;
  const workoutDone = (sessions?.length ?? 0) > 0;
  // Camera sessions record set durations; manual logs count as ~2 min each.
  const activeSec = (sessions ?? []).reduce(
    (a, s) => a + ((s.session_sets as { duration_s: number | null }[]).reduce((b, x) => b + Number(x.duration_s ?? 0), 0) || 120), 0);
  const activeLabel = activeSec > 0 && activeSec < 60 ? "<1m" : `${Math.round(activeSec / 60)}m`;
  const estMin = todayPlan ? estimateSessionMinutes(todayPlan.items) : 0;

  // "Today's targets" ring (PRD §10.3): share of daily goals met.
  const t = day.targets;
  const goals = [
    t ? Math.abs(day.totals.kcal - t.kcal) <= t.kcal * 0.1 : false,
    t ? day.totals.protein_g >= t.protein_g * 0.9 : false,
    todayPlan ? workoutDone : true,
    day.water >= day.waterGoal,
  ];
  const met = goals.filter(Boolean).length;

  const nudge = dailyNudge({
    hour, targets: t ? { kcal: t.kcal, protein_g: t.protein_g } : null, totals: day.totals,
    workoutPlannedToday: Boolean(todayPlan), workoutDoneToday: workoutDone, water: day.water, waterGoal: day.waterGoal,
  });

  const stats = [
    { icon: Flame, label: "Calories", value: day.totals.kcal.toLocaleString(), sub: t ? `of ${t.kcal.toLocaleString()} kcal` : "no target yet" },
    { icon: Target, label: "Protein", value: `${Math.round(day.totals.protein_g)}g`, sub: t ? `${percentOf(day.totals.protein_g, t.protein_g)}% of target` : "" },
    { icon: Timer, label: "Workout time", value: activeLabel, sub: workoutDone ? "logged today" : todayPlan ? "planned today" : "rest day" },
    { icon: Droplet, label: "Hydration", value: `${day.water}/${day.waterGoal}`, sub: day.water >= day.waterGoal ? "goal reached" : `${day.waterGoal - day.water} glasses to go` },
  ];

  return (
    <>
      <PageHeader eyebrow={`${weekdayLabel(today, "long")}, ${today}`} title={`${greeting}, ${first}`} subtitle="Your plan is ready. Let's make today count." />

      {checkIn.posePaused && (
        <div role="status" className="mt-6 flex flex-wrap items-center gap-3 rounded-card border border-nm-warning/40 bg-amber-50 p-5">
          <ShieldAlert className="size-6 shrink-0 text-nm-warning" aria-hidden />
          <p className="min-w-0 flex-1"><span className="font-bold">Rest first.</span> You reported new pain, so workouts are lighter and the camera coach is paused. Please consult a health professional if it continues.</p>
          <Link href="/workout" className="inline-flex h-11 items-center rounded-xl border border-nm-line bg-white px-4 font-bold">Workout settings</Link>
        </div>
      )}
      {checkIn.due && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-card bg-nm-ink-card p-5 text-white">
          <ClipboardCheck className="size-6 shrink-0 text-nm-accent" aria-hidden />
          <p className="min-w-0 flex-1"><span className="font-bold">Your weekly check-in is due.</span> Two minutes of answers so your coach can adjust your targets and plans.</p>
          <Link href="/check-in" className="inline-flex h-11 items-center rounded-xl bg-nm-primary px-5 font-bold text-nm-ink">Start check-in</Link>
        </div>
      )}

      <section className="mt-8 grid items-center gap-6 rounded-card bg-gradient-to-br from-[#c6e98c] to-nm-primary p-7 sm:p-10 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold">Personalized for today</p>
          <h2 className="mt-5 text-[2.369rem] leading-[1.05] font-black sm:text-[3.157rem]">
            {todayPlan ? (todayFocus ?? "Today's session") : "Rest and recover."}
          </h2>
          <p className="mt-3 max-w-xl text-lg">
            {todayPlan
              ? workoutDone ? "Nice work, today's session is logged." : `Your ${estMin}-minute session is ready, with form cues for your level.`
              : nextPlan ? `Next session: ${weekdayLabel(nextPlan.day, "long")}.` : "Build your weekly plan in AI Workout."}
          </p>
          {todayPlan && (
            <p className="mt-3 flex gap-5 text-sm font-bold">
              <span className="inline-flex items-center gap-1.5"><Clock className="size-4" aria-hidden /> {estMin} minutes</span>
              <span className="inline-flex items-center gap-1.5"><Flame className="size-4" aria-hidden /> {profile?.experience_level === "intermediate" ? "Moderate" : "Gentle"}</span>
            </p>
          )}
          <Link href="/workout" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-nm-ink px-6 font-bold text-white">
            View today&apos;s workout <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div className="grid place-items-center rounded-full bg-white/70 p-4">
          <div className="text-center">
            <EnergyRing value={met} target={4} size={180} label="of 4 daily goals" />
          </div>
          <p className="sr-only">{met} of 4 daily goals met</p>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, sub }) => (
          <section key={label} className="flex items-center gap-4 rounded-card border border-nm-line bg-white p-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-nm-soft"><Icon className="size-5 text-nm-primary-dark" aria-hidden /></span>
            <div className="min-w-0">
              <p className="text-sm text-nm-muted">{label}</p>
              <p className="text-2xl font-black tabular-nums">{value}</p>
              <p className="truncate text-xs text-nm-muted">{sub}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-card border border-nm-line bg-white p-6 sm:p-7" aria-labelledby="coach-h">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">AI coach insight</p>
              <h2 id="coach-h" className="mt-1 text-[1.777rem] leading-tight">{nudge.title}</h2>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-nm-primary"><Sparkles className="size-5" aria-hidden /></span>
          </div>
          <p className="mt-4 leading-relaxed text-nm-muted">{nudge.body}</p>
          {(nudge.suggestion || nudge.action) && (
            <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-nm-canvas p-4">
              {nudge.suggestion && (
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{nudge.suggestion.name}</p>
                  <p className="text-sm text-nm-muted">{nudge.suggestion.detail}</p>
                </div>
              )}
              {nudge.action && (
                <Link href={nudge.action.href} className="inline-flex h-11 items-center rounded-xl border border-nm-line bg-nm-soft px-5 font-bold text-nm-primary-ink">{nudge.action.label}</Link>
              )}
            </div>
          )}
        </section>
        <section className="rounded-card border border-nm-line bg-white p-6 sm:p-7" aria-labelledby="week-h">
          <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">This week</p>
          <h2 id="week-h" className="mt-1 text-[1.777rem] leading-tight">Keep your rhythm</h2>
          <ol className="mt-5 flex gap-1.5">
            {plan ? Array.from({ length: 7 }, (_, i) => addDaysISO(plan.plan.week_start, i)).map((d) => {
              const planned = plan.days.find((x) => x.day === d);
              const done = planned?.items.some((it) => it.done);
              return (
                <li key={d} className="text-center">
                  <span className={`grid size-9 place-items-center rounded-full text-xs font-bold ${done ? "bg-nm-primary" : planned ? "border-2 border-nm-primary-dark" : "bg-nm-soft text-nm-muted"} ${d === today ? "ring-2 ring-nm-ink ring-offset-2" : ""}`}>
                    {weekdayLabel(d).slice(0, 2)}
                  </span>
                  <span className="sr-only">{weekdayLabel(d, "long")}: {done ? "done" : planned ? "planned" : "rest"}</span>
                </li>
              );
            }) : <li className="text-sm text-nm-muted">No plan yet.</li>}
          </ol>
          <p className="mt-4 text-xs text-nm-muted">Filled = done · outlined = planned · grey = rest</p>
        </section>
      </div>
      {recentCheckIn && <div className="mt-5"><WhatChanged result={recentCheckIn.result} date={recentCheckIn.date} /></div>}
      {!checkIn.due && (
        <p className="mt-5 text-sm text-nm-muted">
          Next weekly check-in {checkIn.last ? `is due 7 days after ${checkIn.last.date}` : "unlocks a week after onboarding"}.{" "}
          <Link href="/check-in" className="font-bold text-nm-primary-ink underline">Check in early</Link>
        </p>
      )}
    </>
  );
}