import { FrameCropper, type CropCanvas } from "../crop";
import { SkippedFrame } from "../skipped";
import type { CanonicalPose, EstimatorStats } from "../types";
import { mhr70ToCanonical } from "./adapter";
import { cropJointsToFrame } from "./preprocess";
import { DEFAULT_MODEL_URL, type LoadOptions } from "./session";
import type { WorkerRequest, WorkerResponse } from "./worker-core";

type WorkerLike = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
};

export type EstimatorDeps = {
  createWorker?: () => WorkerLike;
  makeCanvas?: (size: number) => CropCanvas;
};

/** The one pose worker allowed per page: each holds 0.5–0.75 GB, so a new one always ends the previous one. */
const live: { estimator: InstantHmrEstimator | null } = { estimator: null };
/** Number of pose workers currently alive on this page (0 or 1). */
export const liveWorkerCount = () => (live.estimator?.alive ? 1 : 0);

/** InstantHMR running in a Web Worker (POSE-01/02/03). Browser-only. */
export class InstantHmrEstimator {
  readonly kind = "instanthmr" as const;
  private worker: WorkerLike;
  private readonly cropper: FrameCropper;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: WorkerResponse & { type: "result" }) => void; reject: (e: Error) => void }>();
  private backend = "";
  private disposed = false;
  private crashed = false;
  private onProgress?: (loaded: number, total: number) => void;
  private onStage?: (stage: string) => void;
  private loadPromise?: Promise<{ backend: string }>;
  private loadResolve?: (v: { backend: string }) => void;
  private loadReject?: (e: Error) => void;

  constructor(
    private readonly modelUrl = DEFAULT_MODEL_URL,
    private readonly opts: LoadOptions = { prefer: "webgpu" },
    deps: EstimatorDeps = {},
  ) {
    if (live.estimator?.alive) live.estimator.dispose(); // free its memory before this worker loads a model
    live.estimator = this;
    this.cropper = new FrameCropper(deps.makeCanvas);
    this.worker = deps.createWorker?.() ?? new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e) => this.handle(e.data);
    this.worker.onerror = (e) => {
      this.crashed = true;
      this.failAll(new Error(e.message || "pose worker crashed"));
    };
  }

  /** False once disposed or crashed: the owner must not keep using (or holding) it. */
  get alive() {
    return !this.disposed && !this.crashed;
  }

  load(onProgress?: (loaded: number, total: number) => void, onStage?: (stage: string) => void) {
    this.onProgress = onProgress;
    this.onStage = onStage;
    this.loadPromise ??= new Promise((resolve, reject) => {
      this.loadResolve = resolve;
      this.loadReject = reject;
      this.post({ type: "load", url: this.modelUrl, opts: this.opts });
    });
    return this.loadPromise;
  }

  /**
   * Crops the person out of the live frame here, on the main thread, and sends the worker only that 224×224 crop
   * and the 3-number CLIFF vector. Joints come back in crop space and are mapped to frame pixels here.
   */
  async estimate(source: CanvasImageSource, frameW: number, frameH: number, box: CanonicalPose["box"]) {
    if (!this.alive) throw new Error("pose worker is not running");
    const { sq, cliff } = this.cropper.draw(source, frameW, frameH, box);
    const crop = await this.cropper.bitmap();
    const id = this.nextId++;
    const res = await new Promise<WorkerResponse & { type: "result" }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ type: "estimate", id, crop, cliff: [cliff[0]!, cliff[1]!, cliff[2]!] }, [crop]);
    });
    const joints2d = cropJointsToFrame(res.joints2dNorm, sq);
    const pose = mhr70ToCanonical(joints2d, res.joints3d, box, performance.now());
    const stats: EstimatorStats = { preprocessMs: res.preprocessMs, inferenceMs: res.inferenceMs, backend: this.backend };
    return { pose, stats, raw2d: joints2d };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.failAll(new Error("disposed"));
    this.worker.terminate();
    if (live.estimator === this) live.estimator = null;
  }

  private post(msg: WorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }

  private handle(msg: WorkerResponse) {
    if (msg.type === "progress") this.onProgress?.(msg.loaded, msg.total);
    else if (msg.type === "stage") this.onStage?.(msg.stage);
    else if (msg.type === "loaded") {
      this.backend = msg.backend;
      this.loadResolve?.({ backend: msg.backend });
    } else if (msg.type === "result") {
      this.pending.get(msg.id)?.resolve(msg);
      this.pending.delete(msg.id);
    } else if (msg.type === "error") {
      const err = msg.skipped ? new SkippedFrame(msg.message) : new Error(msg.message);
      if (msg.id != null) {
        this.pending.get(msg.id)?.reject(err);
        this.pending.delete(msg.id);
      } else {
        this.loadPromise = undefined; // let "Start" retry the load
        this.loadReject?.(err);
      }
    }
  }

  private failAll(err: Error) {
    this.loadReject?.(err);
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
