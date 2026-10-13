// Synthetic poses for unit tests and the pose test harness: a stick figure with a controllable
// primary angle and injectable form faults. Y is down (InstantHMR convention), metres.
import { CANONICAL_JOINTS, type CanonicalPose, type JointName, type Vec2, type Vec3 } from "../types";

const rad = (d: number) => (d * Math.PI) / 180;

function blank(): Record<JointName, Vec3> {
  return Object.fromEntries(CANONICAL_JOINTS.map((n) => [n, [0, 0, 0] as Vec3])) as Record<JointName, Vec3>;
}

function toPose(j3: Record<JointName, Vec3>, t: number): CanonicalPose {
  const j2 = Object.fromEntries(
    CANONICAL_JOINTS.map((n) => [n, [320 + j3[n][0] * 300, 240 + j3[n][1] * 300] as Vec2]),
  ) as Record<JointName, Vec2>;
  return { joints2d: j2, joints3d: j3, box: [0, 0, 640, 480], timestamp: t };
}

/** Knee angle `knee` (deg) on both legs; optional knee cave-in and forward torso lean (deg). */
export function squatPose(knee: number, t: number, o: { valgus?: boolean; lean?: number; leftKnee?: number } = {}) {
  const j = blank();
  for (const [side, sx] of [["l", -1], ["r", 1]] as const) {
    const k = side === "l" && o.leftKnee != null ? o.leftKnee : knee;
    const hip: Vec3 = [0.12 * sx, 0, 0];
    const kneeX = (o.valgus ? 0.04 : 0.13) * sx;
    const kneeP: Vec3 = [kneeX, 0.42, 0];
    const ankle: Vec3 = [0.15 * sx, 0.42 - 0.42 * Math.cos(rad(k)), 0.42 * Math.sin(rad(k))];
    j[`${side}_hip`] = hip;
    j[`${side}_knee`] = kneeP;
    j[`${side}_ankle`] = ankle;
    j[`${side}_heel`] = [ankle[0], ankle[1] + 0.05, ankle[2] + 0.04];
    j[`${side}_big_toe`] = [ankle[0], ankle[1] + 0.05, ankle[2] - 0.15];
    const lean = rad(o.lean ?? 10);
    const shoulder: Vec3 = [0.18 * sx, -0.5 * Math.cos(lean), -0.5 * Math.sin(lean)];
    j[`${side}_shoulder`] = shoulder;
    j[`${side}_elbow`] = [shoulder[0], shoulder[1] + 0.28, shoulder[2]];
    j[`${side}_wrist`] = [shoulder[0], shoulder[1] + 0.52, shoulder[2]];
  }
  j.neck = [0, j.l_shoulder[1] - 0.05, j.l_shoulder[2]];
  j.nose = [0, j.neck[1] - 0.15, j.neck[2]];
  return toPose(j, t);
}

/** Elbow angle `elbow` (deg); `hipDrop` > 0 sags the hips (metres, Y-down), < 0 pikes. */
export function pushupPose(elbow: number, t: number, o: { hipDrop?: number } = {}) {
  const j = blank();
  for (const [side, sx] of [["l", -1], ["r", 1]] as const) {
    const shoulder: Vec3 = [0.2 * sx, 0, 0];
    const elbowP: Vec3 = [0.25 * sx, 0.28, 0];
    const wrist: Vec3 = [0.25 * sx, 0.28 - 0.26 * Math.cos(rad(elbow)), 0.26 * Math.sin(rad(elbow))];
    j[`${side}_shoulder`] = shoulder;
    j[`${side}_elbow`] = elbowP;
    j[`${side}_wrist`] = wrist;
    j[`${side}_hip`] = [0.12 * sx, o.hipDrop ?? 0, 0.8];
    j[`${side}_knee`] = [0.12 * sx, (o.hipDrop ?? 0) / 2, 1.2];
    j[`${side}_ankle`] = [0.12 * sx, 0, 1.6];
    j[`${side}_heel`] = [0.12 * sx, -0.05, 1.65];
    j[`${side}_big_toe`] = [0.12 * sx, 0.05, 1.6];
  }
  j.neck = [0, -0.02, -0.08];
  j.nose = [0, -0.05, -0.25];
  return toPose(j, t);
}

/** Smooth down-and-up angle trajectory: top → bottom → top over `ms`, sampled at `fps`. */
export function repTrajectory(top: number, bottom: number, ms: number, fps = 30): number[] {
  const n = Math.round((ms / 1000) * fps);
  return Array.from({ length: n + 1 }, (_, i) => bottom + ((top - bottom) * (1 + Math.cos((2 * Math.PI * i) / n))) / 2);
}
