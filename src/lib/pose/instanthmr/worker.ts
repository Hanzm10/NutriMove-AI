/// <reference lib="webworker" />
// InstantHMR inference off the main thread (POSE-02). Receives full frames as ImageBitmap + a person box,
// crops/normalises with OffscreenCanvas, runs ORT, and returns frame-pixel 2D + metric 3D joints.
import { createSession, fetchModel, runHmr, type LoadedModel } from "./session";
import { INPUT_SIZE, cliffCond, cropJointsToFrame, rgbaToNormalizedChw, squareCrop, type BBox } from "./preprocess";

export type WorkerRequest =
  | { type: "load"; url: string; prefer: "webgpu" | "wasm" }
  | { type: "estimate"; id: number; frame: ImageBitmap; box: BBox };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "loaded"; backend: string }
  | { type: "result"; id: number; joints2d: Float32Array; joints3d: Float32Array | null; preprocessMs: number; inferenceMs: number }
  | { type: "error"; id?: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let model: LoadedModel | null = null;
const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
const c2d = canvas.getContext("2d", { willReadFrequently: true })!;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      const buf = await fetchModel(msg.url, (loaded, total) => ctx.postMessage({ type: "progress", loaded, total }));
      model = await createSession(buf, msg.prefer);
      ctx.postMessage({ type: "loaded", backend: model.backend } satisfies WorkerResponse);
      return;
    }
    if (msg.type === "estimate") {
      if (!model) throw new Error("model not loaded");
      const t0 = performance.now();
      const { frame, box } = msg;
      const sq = squareCrop(box);
      c2d.fillStyle = "#000";
      c2d.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
      // Clip the source rect to the frame; the rest stays black (matches cv2 border padding).
      const sx = Math.max(0, sq.x), sy = Math.max(0, sq.y);
      const ex = Math.min(frame.width, sq.x + sq.size), ey = Math.min(frame.height, sq.y + sq.size);
      if (ex > sx && ey > sy) {
        const k = INPUT_SIZE / sq.size;
        c2d.drawImage(frame, sx, sy, ex - sx, ey - sy, (sx - sq.x) * k, (sy - sq.y) * k, (ex - sx) * k, (ey - sy) * k);
      }
      const tensor = rgbaToNormalizedChw(c2d.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data);
      const cliff = cliffCond(box, frame.width, frame.height);
      frame.close(); // never keep camera frames around (POSE-08)
      const t1 = performance.now();
      const out = await runHmr(model, tensor, cliff);
      const t2 = performance.now();
      const joints2d = cropJointsToFrame(out.joints2dNorm, sq);
      const res: WorkerResponse = {
        type: "result", id: msg.id, joints2d, joints3d: out.joints3d,
        preprocessMs: t1 - t0, inferenceMs: t2 - t1,
      };
      ctx.postMessage(res, [joints2d.buffer, ...(out.joints3d ? [out.joints3d.buffer] : [])]);
    }
  } catch (err) {
    ctx.postMessage({ type: "error", id: msg.type === "estimate" ? msg.id : undefined, message: String(err) } satisfies WorkerResponse);
  }
};
