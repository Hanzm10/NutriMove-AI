import { afterEach, describe, expect, it } from "vitest";
import { fakeCanvasFactory } from "../test-fakes";
import { isSkippedFrame } from "../skipped";
import { InstantHmrEstimator, liveWorkerCount, type EstimatorDeps } from "./estimator";
import type { WorkerResponse } from "./worker-core";

class FakeWorker {
  static all: FakeWorker[] = [];
  terminated = false;
  sent: { msg: Record<string, unknown>; transfer: Transferable[] }[] = [];
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(msg: Record<string, unknown>, transfer: Transferable[] = []) {
    this.sent.push({ msg, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  reply(msg: WorkerResponse) {
    this.onmessage?.({ data: msg } as MessageEvent<WorkerResponse>);
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const alive = () => FakeWorker.all.filter((w) => !w.terminated).length;

function make(): { est: InstantHmrEstimator; worker: FakeWorker; canvases: ReturnType<typeof fakeCanvasFactory> } {
  const canvases = fakeCanvasFactory();
  const deps: EstimatorDeps = { createWorker: () => new FakeWorker() as unknown as ReturnType<NonNullable<EstimatorDeps["createWorker"]>>, makeCanvas: canvases.factory };
  const est = new InstantHmrEstimator("m.onnx", { prefer: "wasm" }, deps);
  return { est, worker: FakeWorker.all.at(-1)!, canvases };
}

afterEach(() => {
  for (const w of FakeWorker.all) w.terminated = true;
  FakeWorker.all = [];
});

describe("only one pose worker is ever alive", () => {
  it("creating a new estimator terminates the previous worker first", () => {
    const a = make(), b = make(), c = make();
    expect(a.worker.terminated && b.worker.terminated).toBe(true);
    expect(c.worker.terminated).toBe(false);
    expect(alive()).toBe(1);
    expect(liveWorkerCount()).toBe(1);
    expect(a.est.alive).toBe(false);
    c.est.dispose();
    c.est.dispose(); // idempotent
    expect(alive()).toBe(0);
    expect(liveWorkerCount()).toBe(0);
  });

  it("a crashed worker counts as not alive and rejects new frames", async () => {
    const { est, worker } = make();
    worker.onerror?.({ message: "out of memory" } as ErrorEvent);
    expect(est.alive).toBe(false);
    expect(liveWorkerCount()).toBe(0);
    await expect(est.estimate({} as CanvasImageSource, 960, 540, [0, 0, 10, 10])).rejects.toThrow("not running");
  });
});

describe("the worker only receives the cropped image", () => {
  it("crops on the main thread and posts only {type, id, crop 224×224, cliff}", async () => {
    const { est, worker, canvases } = make();
    const video = { videoWidth: 960, videoHeight: 540 } as unknown as CanvasImageSource;
    const p = est.estimate(video, 960, 540, [400, 100, 600, 500]);
    await tick();
    const { msg, transfer } = worker.sent.at(-1)!;
    expect(Object.keys(msg).sort()).toEqual(["cliff", "crop", "id", "type"]);
    expect(msg.type).toBe("estimate");
    const crop = msg.crop as ImageBitmap;
    expect([crop.width, crop.height]).toEqual([224, 224]);
    expect(msg.cliff).toHaveLength(3);
    expect(transfer).toEqual([crop]); // moved, not copied
    expect(Object.values(msg)).not.toContain(video); // the frame itself never goes to the worker
    expect(canvases.made[0]!.draws[0]![0]).toBe(video); // the crop was drawn from the video here

    // Joints come back in crop space; the centre of the crop maps back to the centre of the person's square crop.
    worker.reply({ type: "result", id: msg.id as number, joints2dNorm: new Float32Array(140), joints3d: null, preprocessMs: 1, inferenceMs: 2 });
    const { raw2d } = await p;
    expect(raw2d[0]).toBeCloseTo(500); // box centre x
    expect(raw2d[1]).toBeCloseTo(300); // box centre y
  });

  it("a frame the worker skipped (busy) surfaces as a skipped frame, not a failure", async () => {
    const { est, worker } = make();
    const p = est.estimate({} as CanvasImageSource, 960, 540, [400, 100, 600, 500]);
    await tick();
    worker.reply({ type: "error", id: worker.sent.at(-1)!.msg.id as number, message: "busy", skipped: true });
    await expect(p.catch((e) => isSkippedFrame(e))).resolves.toBe(true);
  });
});
