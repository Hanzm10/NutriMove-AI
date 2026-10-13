import type { CanonicalPose, JointName, Vec2, Vec3 } from "../types";
import { MHR70 } from "./skeleton";

const MAP: Record<JointName, number> = {
  nose: MHR70.nose, neck: MHR70.neck,
  l_shoulder: MHR70.left_shoulder, r_shoulder: MHR70.right_shoulder,
  l_elbow: MHR70.left_elbow, r_elbow: MHR70.right_elbow,
  l_wrist: MHR70.left_wrist, r_wrist: MHR70.right_wrist,
  l_hip: MHR70.left_hip, r_hip: MHR70.right_hip,
  l_knee: MHR70.left_knee, r_knee: MHR70.right_knee,
  l_ankle: MHR70.left_ankle, r_ankle: MHR70.right_ankle,
  l_heel: MHR70.left_heel, r_heel: MHR70.right_heel,
  l_big_toe: MHR70.left_big_toe, r_big_toe: MHR70.right_big_toe,
};

/** MHR70 flat arrays (frame-pixel 2D, metric 3D) → canonical named joints. */
export function mhr70ToCanonical(
  joints2d: Float32Array,
  joints3d: Float32Array | null,
  box: CanonicalPose["box"],
  timestamp: number,
): CanonicalPose {
  const j2 = {} as Record<JointName, Vec2>;
  const j3 = joints3d ? ({} as Record<JointName, Vec3>) : null;
  for (const [name, i] of Object.entries(MAP) as [JointName, number][]) {
    j2[name] = [joints2d[i * 2]!, joints2d[i * 2 + 1]!];
    if (j3 && joints3d) j3[name] = [joints3d[i * 3]!, joints3d[i * 3 + 1]!, joints3d[i * 3 + 2]!];
  }
  return { joints2d: j2, joints3d: j3, box, timestamp };
}
