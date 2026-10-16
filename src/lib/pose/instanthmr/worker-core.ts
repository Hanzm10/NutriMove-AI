// Message handling for the pose worker, separated from `self` so it can be unit-tested. The worker receives only
// a 224×224 person crop (the main thread does the cropping, see ../crop.ts) and returns joints in crop space.
// Everything it needs per frame is allocated once: the canvas, the input buffer, the CLIFF buffer and the tensors.
import { INPUT_SIZE, rgbaToNormalizedChw } from "./preprocess";
import { createRunner, type HmrRunner, type LoadedModel, type LoadOptions } from "./session";

export type WorkerRequest =
  | { type: "load"; url: string; opts: LoadOptions }
  | { type: "estimate"; id: number; crop: ImageBitmap; cliff: readonly [number, number, number] };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "stage"; stage: string }
  | { type: "loaded"; backend: string }
  | { type: "result"; id: number; joints2dNorm: Float32Array; joints3d: Float32Array | null; preprocessMs: number; inferenceMs: number }
  | { type: "error"; id?: number; message: string; skipped?: boolean };

type PixelCtx = {
  drawImage(image: ImageBitmap, dx: number, dy: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
};

export type WorkerDeps = {
  post: (msg: WorkerResponse, transfer?: Transferable[]) => void;
  loadModel: (
    url: string,
    opts: LoadOptions,
    onProgress: (loaded: number, total: number) => void,
    onStage: (stage: string) => void,
  ) => Promise<LoadedModel>;
  /** Creates the worker's one 224×224 pixel canvas. */
  createContext: (size: number) => PixelCtx;
  makeRunner?: (model: LoadedModel, size: number) => HmrRunner;
  now?: () => number;
};

export function createWorkerCore(deps: WorkerDeps) {
  const now = deps.now ?? (() => performance.now());
  const ctx = deps.createContext(INPUT_SIZE); // once per worker
  let runner: HmrRunner | null = null;
  let backend = "";
  let busy = false;

  async function handle(msg: WorkerRequest): Promise<void> {
    if (msg.type === "load") {
      try {
        const model = await deps.loadModel(
          msg.url,
          msg.opts,
          (loaded, total) => deps.post({ type: "progress", loaded, total }),
          (stage) => deps.post({ type: "stage", stage }),
        );
        runner = (deps.makeRunner ?? createRunner)(model, INPUT_SIZE); // input/CLIFF buffers + tensors: once per model
        backend = model.backend;
        deps.post({ type: "loaded", backend });
      } catch (e) {
        deps.post({ type: "error", message: String(e) });
      }
      return;
    }

    const { id, crop } = msg;
    // Only a ready, idle worker and an exactly 224×224 crop are accepted. A second frame while one is running
    // would overwrite the shared input buffer, so it is skipped instead.
    if (!runner || busy || crop.width !== INPUT_SIZE || crop.height !== INPUT_SIZE) {
      const message = !runner ? "model not loaded" : busy ? "busy" : `crop must be ${INPUT_SIZE}×${INPUT_SIZE}, got ${crop.width}×${crop.height}`;
      crop.close();
      deps.post({ type: "error", id, message, skipped: busy });
      return;
    }
    busy = true;
    try {
      const t0 = now();
      ctx.drawImage(crop, 0, 0);
      crop.close(); // never keep camera pixels around (POSE-08)
      rgbaToNormalizedChw(ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data, INPUT_SIZE, runner.input);
      runner.cliff.set(msg.cliff);
      const t1 = now();
      const out = await runner.run();
      const t2 = now();
      const res: WorkerResponse = {
        type: "result", id, joints2dNorm: out.joints2dNorm, joints3d: out.joints3d,
        preprocessMs: t1 - t0, inferenceMs: t2 - t1,
      };
      deps.post(res, [out.joints2dNorm.buffer, ...(out.joints3d ? [out.joints3d.buffer] : [])]);
    } catch (e) {
      deps.post({ type: "error", id, message: String(e) });
    } finally {
      busy = false;
    }
  }

  return { handle, get backend() { return backend; } };
}
