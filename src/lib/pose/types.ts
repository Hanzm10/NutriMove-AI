// Canonical skeleton used by every pose backend (PRD §7.7.1, Appendix B). Exercise analyzers only see this.

export const CANONICAL_JOINTS = [
  "nose", "neck",
  "l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_wrist", "r_wrist",
  "l_hip", "r_hip", "l_knee", "r_knee", "l_ankle", "r_ankle",
  "l_heel", "r_heel", "l_big_toe", "r_big_toe",
] as const;
export type JointName = (typeof CANONICAL_JOINTS)[number];

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export type CanonicalPose = {
  /** Frame pixel coordinates. */
  joints2d: Record<JointName, Vec2>;
  /** Metres, body-centred, Y down (InstantHMR convention). Null when the backend has no 3D. */
  joints3d: Record<JointName, Vec3> | null;
  /** Person box used for this frame [x1, y1, x2, y2] in frame pixels. */
  box: readonly [number, number, number, number];
  timestamp: number;
};

export const CANONICAL_EDGES: ReadonlyArray<readonly [JointName, JointName]> = [
  ["nose", "neck"], ["neck", "l_shoulder"], ["neck", "r_shoulder"],
  ["l_shoulder", "l_hip"], ["r_shoulder", "r_hip"], ["l_hip", "r_hip"],
  ["l_shoulder", "l_elbow"], ["l_elbow", "l_wrist"], ["r_shoulder", "r_elbow"], ["r_elbow", "r_wrist"],
  ["l_hip", "l_knee"], ["l_knee", "l_ankle"], ["l_ankle", "l_heel"], ["l_ankle", "l_big_toe"],
  ["r_hip", "r_knee"], ["r_knee", "r_ankle"], ["r_ankle", "r_heel"], ["r_ankle", "r_big_toe"],
];

export type PoseBackend = "instanthmr" | "remote" | "mediapipe";

export type EstimatorStats = { preprocessMs: number; inferenceMs: number; backend: string };

export interface PoseEstimator {
  readonly kind: PoseBackend;
  load(onProgress?: (loaded: number, total: number) => void): Promise<{ backend: string }>;
  /** Estimate the pose for one live frame. The estimator crops around `box` on the calling thread. */
  estimate(source: CanvasImageSource, frameW: number, frameH: number, box: CanonicalPose["box"]): Promise<{ pose: CanonicalPose; stats: EstimatorStats }>;
  /** False once disposed or broken; the owner must drop it. */
  readonly alive: boolean;
  dispose(): void;
}
