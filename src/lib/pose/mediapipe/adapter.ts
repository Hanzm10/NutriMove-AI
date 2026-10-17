// MediaPipe Pose Landmarker (BlazePose, 33 landmarks) → the MHR70 layout the rest of the pose pipeline already uses
// (tracker, replay files, canonical joints). Only the 18 joints NutriMove needs are filled; the rest stay NaN.
// Pure, no MediaPipe import: unit-tested.
import { MHR70, NUM_JOINTS } from "../instanthmr/skeleton";

/** BlazePose landmark indices (person's own left/right, like MHR70). */
export const BLAZEPOSE = {
  nose: 0,
  left_shoulder: 11, right_shoulder: 12,
  left_elbow: 13, right_elbow: 14,
  left_wrist: 15, right_wrist: 16,
  left_hip: 23, right_hip: 24,
  left_knee: 25, right_knee: 26,
  left_ankle: 27, right_ankle: 28,
  left_heel: 29, right_heel: 30,
  left_foot_index: 31, right_foot_index: 32,
} as const;

/** MHR70 slot ← BlazePose landmark. The big toe is MediaPipe's "foot index"; the neck is the shoulder midpoint. */
const TO_MHR70: ReadonlyArray<readonly [mhr: number, blaze: number]> = [
  [MHR70.nose, BLAZEPOSE.nose],
  [MHR70.left_shoulder, BLAZEPOSE.left_shoulder], [MHR70.right_shoulder, BLAZEPOSE.right_shoulder],
  [MHR70.left_elbow, BLAZEPOSE.left_elbow], [MHR70.right_elbow, BLAZEPOSE.right_elbow],
  [MHR70.left_wrist, BLAZEPOSE.left_wrist], [MHR70.right_wrist, BLAZEPOSE.right_wrist],
  [MHR70.left_hip, BLAZEPOSE.left_hip], [MHR70.right_hip, BLAZEPOSE.right_hip],
  [MHR70.left_knee, BLAZEPOSE.left_knee], [MHR70.right_knee, BLAZEPOSE.right_knee],
  [MHR70.left_ankle, BLAZEPOSE.left_ankle], [MHR70.right_ankle, BLAZEPOSE.right_ankle],
  [MHR70.left_heel, BLAZEPOSE.left_heel], [MHR70.right_heel, BLAZEPOSE.right_heel],
  [MHR70.left_big_toe, BLAZEPOSE.left_foot_index], [MHR70.right_big_toe, BLAZEPOSE.right_foot_index],
];

export type Landmark = { x: number; y: number; z: number; visibility?: number };

export type Mhr70Joints = {
  /** Frame pixels, flat [x0, y0, …] over 70 slots (NaN where MediaPipe has no equivalent). */
  joints2d: Float32Array;
  /** Metres, hip-centred, Y down (MediaPipe world landmarks use the same axes as InstantHMR). Null without world landmarks. */
  joints3d: Float32Array | null;
  /** Lowest visibility (0–1) among the mapped body joints: a cheap "is the whole body in view" signal. */
  minVisibility: number;
};

/**
 * `landmarks` are normalised image coordinates (0–1); `world` are MediaPipe's metric world landmarks for the same pose.
 */
export function blazePoseToMhr70(
  landmarks: readonly Landmark[],
  world: readonly Landmark[] | null,
  frameW: number,
  frameH: number,
): Mhr70Joints {
  const joints2d = new Float32Array(NUM_JOINTS * 2).fill(NaN);
  const joints3d = world ? new Float32Array(NUM_JOINTS * 3).fill(NaN) : null;
  let minVisibility = 1;
  for (const [m, b] of TO_MHR70) {
    const p = landmarks[b];
    if (!p) continue;
    joints2d[m * 2] = p.x * frameW;
    joints2d[m * 2 + 1] = p.y * frameH;
    minVisibility = Math.min(minVisibility, p.visibility ?? 1);
    const w = world?.[b];
    if (joints3d && w) joints3d.set([w.x, w.y, w.z], m * 3);
  }
  // Neck = midpoint of the shoulders (BlazePose has no neck landmark).
  const ls = MHR70.left_shoulder, rs = MHR70.right_shoulder, n = MHR70.neck;
  joints2d[n * 2] = (joints2d[ls * 2]! + joints2d[rs * 2]!) / 2;
  joints2d[n * 2 + 1] = (joints2d[ls * 2 + 1]! + joints2d[rs * 2 + 1]!) / 2;
  if (joints3d) for (let k = 0; k < 3; k++) joints3d[n * 3 + k] = (joints3d[ls * 3 + k]! + joints3d[rs * 3 + k]!) / 2;
  return { joints2d, joints3d, minVisibility };
}

/** Benchmark sanity check: in an upright pose the ankles must be below the shoulders in 3D (Y down). */
export function worldIsYDown(j3: Float32Array): boolean | null {
  const y = (i: number) => j3[i * 3 + 1]!;
  const shoulders = (y(MHR70.left_shoulder) + y(MHR70.right_shoulder)) / 2;
  const ankles = (y(MHR70.left_ankle) + y(MHR70.right_ankle)) / 2;
  if (!Number.isFinite(shoulders) || !Number.isFinite(ankles)) return null;
  return ankles > shoulders;
}
