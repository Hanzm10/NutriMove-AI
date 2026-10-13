// Shared by the workout screen and Overview so both show the same session length.
export const TIMED_SLUGS = new Set([
  "plank", "superman", "mountain-climber", "step-jack", "jumping-jack", "march-in-place", "high-knees", "stretch-lower", "stretch-upper",
]);

export type EstimableItem = { sets: number; reps: number; rest_s: number; exercise: { slug: string } | null };

/** ~3 s per rep (or the hold time), plus rest and 30 s set-up per exercise. */
export function estimateSessionMinutes(items: EstimableItem[]): number {
  const secs = items.reduce(
    (a, i) => a + i.sets * ((TIMED_SLUGS.has(i.exercise?.slug ?? "") ? i.reps : i.reps * 3) + i.rest_s) + 30,
    0,
  );
  return Math.round(secs / 60);
}
