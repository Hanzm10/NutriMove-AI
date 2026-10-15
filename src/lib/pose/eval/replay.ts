// Clip replay for evaluation (PRD §12, POSE-17). Pure: turns recorded joints into the same rep/form decisions the live
// coach makes (One-Euro smoothing → 1 s "ready" gate → exercise analyzer). No DOM, no Supabase.
import { createAnalyzer } from "../analyzers/exercises";
import type { ExerciseAnalyzer, ExerciseKind } from "../analyzers/types";
import { PoseSmoother } from "../one-euro";
import { CANONICAL_JOINTS, type CanonicalPose, type JointName, type Vec2, type Vec3 } from "../types";

/** One sampled video frame: time (ms), whether the person was tracked, and the 18 canonical joints. Joints only, never pixels. */
export type ClipFrame = { t: number; v: 0 | 1; j2: number[]; j3: number[] | null };

/** The joints-only file the replay page exports (`*.joints.json`). */
export type ClipJoints = {
  version: 1;
  file: string;
  exercise: ExerciseKind;
  fps: number;
  width: number;
  height: number;
  durationS: number;
  backend: string;
  frames: ClipFrame[];
};

/** One movement the analyzer saw: a counted rep, or a shallow attempt it did not count. */
export type Attempt = { index: number; counted: boolean; errors: string[]; tMs: number };

const READY_MS = 1000; // same gate as the live coach (POSE-05)
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function poseToFrame(pose: CanonicalPose, t: number, visible: boolean): ClipFrame {
  return {
    t: Math.round(t),
    v: visible ? 1 : 0,
    j2: CANONICAL_JOINTS.flatMap((n) => pose.joints2d[n].map((x) => Math.round(x * 10) / 10)),
    j3: pose.joints3d ? CANONICAL_JOINTS.flatMap((n) => pose.joints3d![n].map(r4)) : null,
  };
}

export function frameToPose(f: ClipFrame): CanonicalPose {
  const joints2d = {} as Record<JointName, Vec2>;
  const joints3d = f.j3 ? ({} as Record<JointName, Vec3>) : null;
  CANONICAL_JOINTS.forEach((n, i) => {
    joints2d[n] = [f.j2[i * 2]!, f.j2[i * 2 + 1]!];
    if (joints3d && f.j3) joints3d[n] = [f.j3[i * 3]!, f.j3[i * 3 + 1]!, f.j3[i * 3 + 2]!];
  });
  return { joints2d, joints3d, box: [0, 0, 0, 0], timestamp: f.t };
}

/** Runs a clip through the live coach's logic. Pass `makeAnalyzer` to try other thresholds when tuning. */
export function analyzeClip(
  kind: ExerciseKind,
  frames: readonly ClipFrame[],
  makeAnalyzer: (k: ExerciseKind) => ExerciseAnalyzer = createAnalyzer,
): { attempts: Attempt[]; reps: number; partials: number } {
  const analyzer = makeAnalyzer(kind);
  const smoother = new PoseSmoother();
  const attempts: Attempt[] = [];
  let readySince: number | null = null;
  let ready = false;
  for (const f of frames) {
    if (!f.v) continue; // the live coach only analyses frames where the person is tracked
    const pose = smoother.smooth(frameToPose(f));
    if (!ready) {
      readySince ??= f.t;
      if (f.t - readySince > READY_MS) ready = true;
      continue;
    }
    for (const ev of analyzer.update(pose)) {
      if (ev.type === "rep") attempts.push({ index: attempts.length + 1, counted: true, errors: ev.errors, tMs: f.t });
      else if (ev.type === "partial") attempts.push({ index: attempts.length + 1, counted: false, errors: ev.errors, tMs: f.t });
    }
  }
  return { attempts, reps: attempts.filter((a) => a.counted).length, partials: attempts.filter((a) => !a.counted).length };
}
