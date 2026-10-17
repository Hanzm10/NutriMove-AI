import type { CanonicalPose } from "../types";

export type ExerciseKind = "squat" | "pushup" | "lunge";

export type CueSeverity = "safety" | "depth" | "posture";

export type Cue = { code: string; message: string; severity: CueSeverity };

export type RepPhase = "top" | "descending" | "bottom" | "ascending";

export type AnalyzerEvent =
  | { type: "rep"; index: number; good: boolean; errors: string[]; minAngle: number; durationMs: number }
  | { type: "partial"; errors: string[]; minAngle: number }
  /** A movement that wasn't the exercise (e.g. one knee raised): not counted, no cue. `gate` names the rule that said so. */
  | { type: "ignored"; gate: string; minAngle: number }
  | { type: "cue"; cue: Cue };

export type FrameMetrics = {
  /** Primary signal (e.g. knee angle), degrees. */
  angle: number;
  /** Form-check codes violated on this frame. */
  violations: string[];
  /**
   * Gate that fails on this frame, if any: `any` voids every attempt whose deepest frame fails it, `rep` only voids
   * full reps (shallow attempts still get the depth cue).
   */
  gate?: { any: string | null; rep: string | null };
};

export interface ExerciseAnalyzer {
  readonly kind: ExerciseKind;
  /** Feed one smoothed pose; returns events produced by this frame. */
  update(pose: CanonicalPose): AnalyzerEvent[];
  readonly phase: RepPhase;
  readonly reps: number;
  readonly goodReps: number;
  readonly errorCounts: Record<string, number>;
  reset(): void;
}
