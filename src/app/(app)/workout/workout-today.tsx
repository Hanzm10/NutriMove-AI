"use client";

import { Camera, CheckCircle2, Clock, Dumbbell, Flame, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addDaysISO, weekdayLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { PlanView } from "@/lib/workout/plan";
import { regeneratePlan, saveSession } from "./actions";

type View = NonNullable<PlanView>;
type Item = View["days"][number]["items"][number];

const TIMED = new Set(["plank", "superman", "mountain-climber", "step-jack", "jumping-jack", "march-in-place", "high-knees", "stretch-lower", "stretch-upper"]);
const amount = (i: Item) => (TIMED.has(i.exercise!.slug) ? `${i.reps} s` : `${i.reps} reps`);
const estMin = (items: Item[]) =>
  Math.round(items.reduce((a, i) => a + i.sets * ((TIMED.has(i.exercise!.slug) ? i.reps : i.reps * 3) + i.rest_s) + 30, 0) / 60);

export function WorkoutToday({ view, reasons }: { view: View; reasons: string[] }) {
  const [tab, setTab] = useState<"today" | "week">("today");
  const todayIdx = view.days.findIndex((d) => d.day === view.today);
  const nextIdx = todayIdx >= 0 ? todayIdx : view.days.findIndex((d) => d.day > view.today);
  const session = view.days[nextIdx];
  const isToday = todayIdx >= 0;
  const [selected, setSelected] = useState(0);
  const items = session?.items ?? [];
  const current = items[selected];
  const done = items.filter((i) => i.done).length;
  const weekEnd = addDaysISO(view.plan.week_start, 6);
  const [pending, start] = useTransition();

  return (
    <div className="mt-8 grid gap-5">
      <div role="tablist" aria-label="Plan view" className="flex w-fit gap-1 rounded-xl bg-nm-soft p-1">
        {(["today", "week"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("min-h-10 rounded-lg px-4 text-sm font-bold", tab === t ? "bg-white shadow-card" : "text-nm-muted")}
          >
            {t === "today" ? "Today's plan" : "This week"}
          </button>
        ))}
      </div>

      {tab === "week" ? (
        <section className="rounded-card border border-nm-line bg-white p-6" aria-label="This week">
          <ol className="grid gap-3">
            {view.days.map((d) => (
              <li key={d.day} className={cn("rounded-2xl border p-4", d.day === view.today ? "border-nm-primary-dark bg-nm-soft/50" : "border-nm-line")}>
                <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">
                  {weekdayLabel(d.day, "long")} {d.day === view.today && "· today"}
                </p>
                <p className="mt-1 font-bold">
                  {d.items.length} moves · about {estMin(d.items)} min · {d.items.filter((i) => i.done).length} done
                </p>
                <p className="mt-1 text-sm text-nm-muted">{d.items.map((i) => i.exercise!.name).join(" · ")}</p>
              </li>
            ))}
          </ol>
          <ul className="mt-5 list-disc space-y-1 pl-5 text-sm text-nm-muted">
            {reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <form action={() => start(async () => { await regeneratePlan(); toast.success("New plan created"); })} className="mt-5">
            <Button type="submit" variant="outline" disabled={pending} className="h-11 rounded-xl bg-white font-bold">
              <RefreshCw aria-hidden /> {pending ? "Rebuilding…" : "Rebuild my plan"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-nm-muted">Plan week: {view.plan.week_start} to {weekEnd}</p>
        </section>
      ) : !session ? (
        <section className="rounded-card border border-nm-line bg-white p-6">
          <h2 className="text-[1.777rem]">This week&apos;s plan is complete</h2>
          <p className="mt-2 text-nm-muted">Great work. Rebuild your plan to start a new week.</p>
          <form action={() => start(async () => { await regeneratePlan(); })} className="mt-4">
            <Button type="submit" disabled={pending} className="h-11 rounded-xl font-bold">Start a new week</Button>
          </form>
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center gap-6 rounded-card border border-nm-line bg-white p-6 sm:p-7">
            <div className="min-w-60 flex-1">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-nm-soft px-3 py-1 text-xs font-bold text-nm-primary-ink">
                <Sparkles className="size-3.5" aria-hidden /> {isToday ? "Today's plan" : `Next: ${weekdayLabel(session.day, "long")}`}
              </p>
              <h2 className="mt-3 text-[1.777rem] leading-tight">
                {((view.plan.explanation as { focus?: string[] } | null)?.focus?.[nextIdx]) ?? "Your session"}
              </h2>
              {!isToday && <p className="mt-1 text-nm-muted">Rest day today. Recovery is part of the plan.</p>}
            </div>
            <dl className="grid grid-cols-3 gap-6 text-center">
              <Stat icon={Clock} label="Duration" value={`${estMin(items)} min`} />
              <Stat icon={Flame} label="Moves" value={String(items.length)} />
              <Stat icon={Dumbbell} label="Done" value={`${done} of ${items.length}`} />
            </dl>
            <div className="w-full">
              <div className="h-1.5 rounded-full bg-nm-soft" role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
                <div className="h-full rounded-full bg-nm-primary" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <section className="rounded-card border border-nm-line bg-white p-5" aria-labelledby="flow-h">
              <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Session flow</p>
              <h3 id="flow-h" className="mt-1 text-xl">Your exercises</h3>
              <ol className="mt-4 grid gap-2">
                {items.map((it, i) => (
                  <li key={it.id}>
                    <button
                      onClick={() => setSelected(i)}
                      aria-current={i === selected ? "step" : undefined}
                      className={cn("flex w-full items-center gap-3 rounded-2xl p-3 text-left", i === selected ? "bg-nm-soft" : "hover:bg-nm-soft/50")}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-sm font-bold">
                        {it.done ? <CheckCircle2 className="size-5 text-nm-primary-dark" aria-label="Done" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{it.exercise!.name}</span>
                        <span className="block text-xs text-nm-muted">
                          {it.sets} {it.sets === 1 ? "set" : "sets"} · {amount(it)}
                        </span>
                      </span>
                      {it.exercise!.pose_supported && <Camera className="size-4 shrink-0 text-nm-primary-dark" aria-label="Camera coach available" />}
                    </button>
                  </li>
                ))}
              </ol>
            </section>

            {current && <ExerciseDetail key={current.id} item={current} index={selected} total={items.length} canLog={isToday} />}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div>
      <Icon className="mx-auto size-5 text-nm-primary-dark" aria-hidden />
      <dd className="mt-1 font-bold">{value}</dd>
      <dt className="text-xs text-nm-muted">{label}</dt>
    </div>
  );
}

function ExerciseDetail({ item, index, total, canLog }: { item: Item; index: number; total: number; canLog: boolean }) {
  const ex = item.exercise!;
  const [logging, setLogging] = useState(false);
  const [reps, setReps] = useState<number[]>(() => Array(item.sets).fill(item.reps));
  const [rating, setRating] = useState<"easy" | "right" | "hard">("right");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await saveSession({
        exerciseSlug: ex.slug,
        planItemId: item.id,
        backend: "manual",
        startedAt: new Date().toISOString(),
        rating,
        sets: reps.map((r) => ({ reps: r, good: r, errorCounts: {}, durationS: null })),
      });
      if (res.ok) {
        toast.success(`${ex.name} logged`);
        setLogging(false);
      } else toast.error(res.error ?? "Could not save");
    });
  }

  return (
    <section className="rounded-card border border-nm-line bg-white p-6 sm:p-7" aria-labelledby="ex-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Exercise {index + 1} of {total}</p>
          <h3 id="ex-h" className="mt-1 text-[1.777rem] leading-tight">{ex.name}</h3>
        </div>
        <p className="rounded-xl bg-nm-soft px-3 py-2 text-sm font-bold">{item.sets} {item.sets === 1 ? "set" : "sets"} · {amount(item)}</p>
      </div>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {ex.steps.map((s, i) => (
          <li key={s} className="border-t border-nm-line pt-3">
            <span className="text-xs font-bold text-nm-primary-ink">{String(i + 1).padStart(2, "0")}</span>
            <p className="mt-1 text-sm leading-relaxed">{s}</p>
          </li>
        ))}
      </ol>
      {ex.cues[0] && (
        <div className="mt-6 rounded-2xl bg-nm-soft p-4">
          <p className="flex items-center gap-2 font-bold"><Sparkles className="size-4 text-nm-primary-dark" aria-hidden /> Form cue</p>
          <p className="mt-1 text-sm">{ex.cues.join(" ")}</p>
        </div>
      )}

      {logging ? (
        <div className="mt-6 grid gap-4 rounded-2xl border border-nm-line p-4">
          <p className="font-bold">How many did you do?</p>
          <div className="flex flex-wrap gap-3">
            {reps.map((r, i) => (
              <label key={i} className="flex flex-col gap-1 text-xs font-bold">
                Set {i + 1}
                <input
                  type="number" min={0} max={500} value={r}
                  onChange={(e) => setReps(reps.map((x, j) => (j === i ? Number(e.target.value) : x)))}
                  className="h-11 w-20 rounded-xl border border-nm-line bg-nm-soft/60 px-3 text-base"
                />
              </label>
            ))}
          </div>
          <fieldset>
            <legend className="text-sm font-bold">How did it feel?</legend>
            <div className="mt-2 flex gap-2">
              {(["easy", "right", "hard"] as const).map((v) => (
                <label key={v} className={cn("cursor-pointer rounded-xl border px-4 py-2 text-sm font-bold has-[:focus-visible]:ring-3", rating === v ? "border-nm-primary-dark bg-nm-soft" : "border-nm-line")}>
                  <input type="radio" name="rating" className="sr-only" checked={rating === v} onChange={() => setRating(v)} />
                  {v === "easy" ? "Too easy" : v === "right" ? "Just right" : "Too hard"}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button onClick={save} disabled={pending} className="h-11 rounded-xl font-bold">{pending ? "Saving…" : "Save"}</Button>
            <Button variant="outline" onClick={() => setLogging(false)} className="h-11 rounded-xl bg-white">Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {ex.pose_supported && (
            <Link
              href={`/workout/live?exercise=${ex.slug}&item=${item.id}&sets=${item.sets}&reps=${item.reps}`}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-nm-ink px-5 font-bold text-white"
            >
              <Camera className="size-4" aria-hidden /> Start camera coach
            </Link>
          )}
          {canLog && (
            <Button
              variant={ex.pose_supported ? "outline" : "default"}
              onClick={() => setLogging(true)}
              className="h-12 rounded-xl px-5 font-bold"
            >
              <CheckCircle2 aria-hidden /> {item.done ? "Log again" : "Mark complete"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
