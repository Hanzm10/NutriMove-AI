// MediaPipe Pose Landmarker as a pose backend (Phase 0 benchmark, docs/pose-optimization-plan.md). Browser-only;
// @mediapipe/tasks-vision is imported lazily. Runtime (/mediapipe) and models (/models) are served from our own site.
import { mhr70ToCanonical } from "../instanthmr/adapter";
import type { CanonicalPose, EstimatorStats } from "../types";
import { blazePoseToMhr70, type Landmark } from "./adapter";

export type MediaPipeVariant = "lite" | "full" | "heavy";
export type MediaPipeDelegate = "GPU" | "CPU";

export const MEDIAPIPE_WASM_PATH = "/mediapipe";
export const mediaPipeModelUrl = (v: MediaPipeVariant) => `/models/pose_landmarker_${v}.task`;

/** The subset of PoseLandmarker the estimator uses (lets tests pass a fake). */
export type LandmarkerLike = {
  detectForVideo(frame: CanvasImageSource, timestampMs: number): { landmarks: Landmark[][]; worldLandmarks: Landmark[][] };
  close(): void;
};
export type CreateLandmarker = (variant: MediaPipeVariant, delegate: MediaPipeDelegate) => Promise<LandmarkerLike>;

const createDefault: CreateLandmarker = async (variant, delegate) => {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: mediaPipeModelUrl(variant), delegate },
    runningMode: "VIDEO",
    numPoses: 1,
  }) as unknown as Promise<LandmarkerLike>;
};

export class MediaPipePoseEstimator {
  readonly kind = "mediapipe" as const;
  private landmarker: LandmarkerLike | null = null;
  private lastTs = 0;
  private disposed = false;
  private broken = false;
  /** The delegate actually in use after load (GPU can fall back to CPU). */
  delegate: MediaPipeDelegate;

  constructor(
    readonly variant: MediaPipeVariant = "lite",
    prefer: MediaPipeDelegate = "GPU",
    private readonly create: CreateLandmarker = createDefault,
  ) {
    this.delegate = prefer;
  }

  /** False once disposed, or once MediaPipe's graph has failed (it stays failed, so the owner must load a new one). */
  get alive() {
    return !this.disposed && !this.broken;
  }

  /** Loads the model; if the GPU delegate fails (no WebGL2, blocked GPU), retries once on CPU. */
  async load(): Promise<{ backend: string }> {
    if (this.landmarker) return { backend: this.backendLabel };
    try {
      this.landmarker = await this.create(this.variant, this.delegate);
    } catch (e) {
      if (this.delegate === "CPU") throw e;
      this.delegate = "CPU";
      this.landmarker = await this.create(this.variant, "CPU");
    }
    if (this.disposed) this.landmarker.close();
    return { backend: this.backendLabel };
  }

  get backendLabel() {
    return `mediapipe-${this.variant} (${this.delegate.toLowerCase()})`;
  }

  /**
   * Same shape as the other estimators. MediaPipe finds and tracks the person itself, so `box` is only echoed back.
   * `found` is false when no person was detected in this frame.
   */
  estimate(source: CanvasImageSource, frameW: number, frameH: number, box: CanonicalPose["box"]) {
    if (!this.landmarker || !this.alive) throw new Error("MediaPipe pose model is not loaded");
    const t0 = performance.now();
    const stats: EstimatorStats = { preprocessMs: 0, inferenceMs: 0, backend: this.backendLabel };
    // An empty frame (camera just stopped) puts MediaPipe's graph into a permanent error state: never send one.
    if (!(frameW > 0 && frameH > 0)) return { pose: null, stats, raw2d: null, found: false as const, minVisibility: 0 };
    // VIDEO mode needs strictly increasing timestamps.
    const ts = Math.max(Math.round(t0), this.lastTs + 1);
    this.lastTs = ts;
    let res: ReturnType<LandmarkerLike["detectForVideo"]>;
    try {
      res = this.landmarker.detectForVideo(source, ts);
    } catch (e) {
      this.broken = true;
      throw e;
    }
    stats.inferenceMs = performance.now() - t0;
    const lm = res.landmarks[0];
    if (!lm) return { pose: null, stats, raw2d: null, found: false as const, minVisibility: 0 };
    const j = blazePoseToMhr70(lm, res.worldLandmarks[0] ?? null, frameW, frameH);
    const pose = { ...mhr70ToCanonical(j.joints2d, j.joints3d, box, performance.now()), visibility: j.visibility };
    return { pose, stats, raw2d: j.joints2d, raw3d: j.joints3d, found: true as const, minVisibility: j.minVisibility };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.landmarker?.close();
    this.landmarker = null;
  }
}
