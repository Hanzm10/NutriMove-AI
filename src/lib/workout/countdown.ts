// Set and rest countdown: how long to aim for, and what to announce as it runs. A guide, not a limit: the set keeps
// going past zero until the user ends it. Pure, used by the workout screen and the camera coach.

/** Same pace as the session-length estimate (./estimate.ts). */
export const SECONDS_PER_REP = 3;

/** Guide time for one set: the hold time for timed moves, else about 3 s a rep, rounded up to 5 s (at least 10 s). */
export function setSeconds(timed: boolean, reps: number): number {
  if (timed) return Math.max(5, Math.round(reps));
  return Math.max(10, Math.ceil((reps * SECONDS_PER_REP) / 5) * 5);
}

export type CountdownCue = { say?: string; beep?: "tick" | "go" };

/**
 * What to announce as the countdown goes from `prev` to `left` whole seconds. A cue fires once, on the second it
 * reaches; if a tick was skipped (the phone was busy) only the latest crossed one fires, so cues never pile up.
 * `quiet` (camera coach) keeps the last seconds to beeps, so form cues aren't talked over.
 */
export function countdownCue(
  prev: number,
  left: number,
  total: number,
  opts: { phase: "work" | "rest"; quiet?: boolean },
): CountdownCue | null {
  if (!(left < prev)) return null;
  const marks = [30, 10, 5, 4, 3, 2, 1, 0].filter((m) => m < prev && m >= left);
  const m = marks.at(-1);
  if (m === undefined) return null;
  const rest = opts.phase === "rest";
  if (m === 0) return rest ? { say: "Go!", beep: "go" } : { say: "Time!", beep: "go" };
  if (m <= 5) return opts.quiet || (rest && m > 3) ? { beep: "tick" } : { say: String(m), beep: "tick" };
  if (m === 10 && total >= 20) return { say: rest ? "10 seconds of rest left" : "10 seconds left" };
  if (m === 30 && total >= 45 && !opts.quiet) return { say: rest ? "30 seconds of rest left" : "30 seconds left" };
  return null;
}

/** "0:45", or "+0:07" once past zero (overtime). */
export function formatClock(left: number): string {
  const s = Math.abs(Math.trunc(left));
  return `${left < 0 ? "+" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
