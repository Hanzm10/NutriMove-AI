// Pure aggregation for the Progress screen (DASH-02). No I/O; unit-tested.

export type Range = "7d" | "4w" | "3m";
export const RANGE_DAYS: Record<Range, number> = { "7d": 7, "4w": 28, "3m": 91 };

export type DayInput = {
  date: string;
  kcal: number;
  proteinG: number;
  targetKcal: number | null;
  targetProteinG: number | null;
  activeMin: number;
  workoutDone: boolean;
  workoutPlanned: boolean;
  repsCounted: number;
  repsGood: number;
  water: number;
  logged: boolean;
};

export type Bucket = {
  label: string;
  start: string;
  kcal: number | null; // average over logged days
  targetKcal: number | null;
  withinTarget: number; // days within ±10%
  loggedDays: number;
  activeMin: number;
  weightKg: number | null;
};

export type ProgressSummary = {
  consistency: { done: number; planned: number };
  activeMin: number;
  calorieDays: { within: number; logged: number; total: number };
  goodForm: { good: number; counted: number; pct: number | null };
  buckets: Bucket[];
  milestones: Milestone[];
};

export type Milestone = { id: string; title: string; detail: string; achieved: boolean };

const within = (d: DayInput) => d.logged && d.targetKcal != null && Math.abs(d.kcal - d.targetKcal) <= d.targetKcal * 0.1;

/** Longest run of consecutive `true` values. */
export function longestStreak(flags: boolean[]): number {
  let best = 0, cur = 0;
  for (const f of flags) {
    cur = f ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

/** Simple rule-based milestones (PRD §10.3), computed over all history passed in. */
export function milestones(days: DayInput[], totals: { goodRepsAllTime: number; checkIns: number }): Milestone[] {
  const workouts = days.filter((d) => d.workoutDone).length;
  const logStreak = longestStreak(days.map((d) => d.logged));
  const proteinDays = days.filter((d) => d.targetProteinG != null && d.proteinG >= d.targetProteinG * 0.9).length;
  const calorieDays = days.filter(within).length;
  return [
    { id: "first-workout", title: "First workout", detail: workouts ? `${workouts} workout day${workouts > 1 ? "s" : ""} so far` : "Finish any session", achieved: workouts >= 1 },
    { id: "log-streak-3", title: "3-day logging streak", detail: `Best streak: ${logStreak} day${logStreak === 1 ? "" : "s"}`, achieved: logStreak >= 3 },
    { id: "protein-3", title: "Protein on point", detail: `${proteinDays} of 3 days at ≥ 90% protein`, achieved: proteinDays >= 3 },
    { id: "calories-5", title: "Five days on target", detail: `${calorieDays} of 5 days within ±10% of calories`, achieved: calorieDays >= 5 },
    { id: "good-reps-100", title: "100 good-form reps", detail: `${totals.goodRepsAllTime} of 100 coached reps`, achieved: totals.goodRepsAllTime >= 100 },
    { id: "first-check-in", title: "First weekly check-in", detail: totals.checkIns ? "Your coach has adapted your plan" : "Due a week after onboarding", achieved: totals.checkIns >= 1 },
  ];
}

const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", timeZone: "UTC" });

/**
 * Daily buckets for 7d/4w, weekly buckets for 3m. `days` must cover the range oldest → newest;
 * weights are the latest weigh-in inside each bucket.
 */
export function summarize(range: Range, today: string, days: DayInput[], weights: { date: string; kg: number }[], allTime: { goodRepsAllTime: number; checkIns: number }, history: DayInput[] = days): ProgressSummary {
  const n = RANGE_DAYS[range];
  const start = addDays(today, -(n - 1));
  const inRange = days.filter((d) => d.date >= start && d.date <= today);
  const step = range === "3m" ? 7 : 1;
  const buckets: Bucket[] = [];
  for (let i = 0; i < n; i += step) {
    const bStart = addDays(start, i);
    const bEnd = addDays(start, Math.min(n - 1, i + step - 1));
    const ds = inRange.filter((d) => d.date >= bStart && d.date <= bEnd);
    const logged = ds.filter((d) => d.logged);
    const ws = weights.filter((w) => w.date >= bStart && w.date <= bEnd).sort((a, b) => a.date.localeCompare(b.date));
    const targets = ds.map((d) => d.targetKcal).filter((t): t is number => t != null);
    buckets.push({
      label: step === 1 ? (range === "7d" ? weekday(bStart) : shortDate(bStart)) : shortDate(bStart),
      start: bStart,
      kcal: logged.length ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length) : null,
      targetKcal: targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : null,
      withinTarget: ds.filter(within).length,
      loggedDays: logged.length,
      activeMin: Math.round(ds.reduce((a, d) => a + d.activeMin, 0)),
      weightKg: ws.length ? ws[ws.length - 1]!.kg : null,
    });
  }
  const counted = inRange.reduce((a, d) => a + d.repsCounted, 0);
  const good = inRange.reduce((a, d) => a + d.repsGood, 0);
  return {
    consistency: { done: inRange.filter((d) => d.workoutPlanned && d.workoutDone).length, planned: inRange.filter((d) => d.workoutPlanned).length },
    activeMin: Math.round(inRange.reduce((a, d) => a + d.activeMin, 0)),
    calorieDays: { within: inRange.filter(within).length, logged: inRange.filter((d) => d.logged).length, total: n },
    goodForm: { good, counted, pct: counted ? Math.round((good / counted) * 100) : null },
    buckets,
    milestones: milestones(history, allTime),
  };
}
