import type { CanonicalPose, EstimatorStats, PoseEstimator } from "../types";
import { mhr70ToCanonical } from "./adapter";
import { DEFAULT_MODEL_URL, type LoadOptions } from "./session";
import type { WorkerRequest, WorkerResponse } from "./worker";

/** InstantHMR running in a Web Worker (POSE-01/02/03). Browser-only. */
export class InstantHmrEstimator implements PoseEstimator {
  readonly kind = "instanthmr" as const;
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: WorkerResponse & { type: "result" }) => void; reject: (e: Error) => void }>();
  private backend = "";
  private onProgress?: (loaded: number, total: number) => void;
  private onStage?: (stage: string) => void;
  private loadPromise?: Promise<{ backend: string }>;
  private loadResolve?: (v: { backend: string }) => void;
  private loadReject?: (e: Error) => void;

  constructor(
    private readonly modelUrl = DEFAULT_MODEL_URL,
    private readonly opts: LoadOptions = { prefer: "webgpu" },
  ) {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handle(e.data);
    this.worker.onerror = (e) => this.failAll(new Error(e.message || "pose worker crashed"));
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

  async estimate(frame: ImageBitmap, box: CanonicalPose["box"]) {
    const id = this.nextId++;
    const res = await new Promise<WorkerResponse & { type: "result" }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ type: "estimate", id, frame, box: box as [number, number, number, number] }, [frame]);
    });
    const pose = mhr70ToCanonical(res.joints2d, res.joints3d, box, performance.now());
    const stats: EstimatorStats = { preprocessMs: res.preprocessMs, inferenceMs: res.inferenceMs, backend: this.backend };
    return { pose, stats, raw2d: res.joints2d };
  }

  dispose() {
    this.failAll(new Error("disposed"));
    this.worker.terminate();
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
      const err = new Error(msg.message);
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
