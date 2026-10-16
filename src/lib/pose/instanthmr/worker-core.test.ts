import { describe, expect, it, vi } from "vitest";
import { fakeModel } from "../test-fakes";
import { createRunner, type HmrRunner, type LoadedModel } from "./session";
import { createWorkerCore, type WorkerResponse } from "./worker-core";

const bitmap = (w = 224, h = 224) => ({ width: w, height: h, close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };

function setup(opts: { runDelay?: () => Promise<void>; failOnRun?: number } = {}) {
  const { model, session, runs, tensorsMade } = fakeModel();
  if (opts.runDelay || opts.failOnRun != null) {
    const real = session.run.getMockImplementation()!;
    let n = 0;
    session.run.mockImplementation(async (feeds, fetches) => {
      if (n++ === opts.failOnRun) throw new Error("ORT failed");
      await opts.runDelay?.();
      return real(feeds, fetches);
    });
  }
  const posted: WorkerResponse[] = [];
  // Each frame's pixels are a different grey level, so we can see which frame the model actually received.
  let frame = 0;
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(224 * 224 * 4).fill(++frame % 256) })),
  };
  const createContext = vi.fn(() => ctx);
  const runners: HmrRunner[] = [];
  const makeRunner = vi.fn((m: LoadedModel, size: number) => {
    const r = createRunner(m, size);
    runners.push(r);
    return r;
  });
  const core = createWorkerCore({
    post: (m) => void posted.push(m),
    loadModel: async () => model,
    createContext,
    makeRunner,
  });
  return { core, posted, ctx, createContext, makeRunner, runners, runs, tensorsMade };
}

const estimate = (id: number, crop = bitmap()) => ({ type: "estimate" as const, id, crop, cliff: [0.1, -0.2, 0.5] as const });

describe("pose worker: buffers are created once and reused for the worker's whole life", () => {
  it("reuses the canvas, input buffer, CLIFF buffer and tensors across 60 frames, errors and rejected crops", async () => {
    const s = setup({ failOnRun: 10 });
    await s.core.handle({ type: "load", url: "m.onnx", opts: { prefer: "wasm" } });
    const runner = s.runners[0]!;
    const input = runner.input, cliff = runner.cliff;
    for (let i = 1; i <= 60; i++) {
      await s.core.handle(estimate(i, i % 20 === 0 ? bitmap(960, 540) : bitmap())); // every 20th crop is the wrong size
    }
    expect(s.createContext).toHaveBeenCalledTimes(1);
    expect(s.makeRunner).toHaveBeenCalledTimes(1);
    expect(s.tensorsMade).toHaveBeenCalledTimes(2);
    expect(runner.input).toBe(input);
    expect(runner.cliff).toBe(cliff);
    expect(new Set(s.runs.map((r) => r.feeds)).size).toBe(1);
    expect(s.runs.every((r) => r.feeds.image!.data === input)).toBe(true);
    expect(Array.from(cliff)).toEqual([0.1, -0.2, 0.5].map(Math.fround)); // written in place
    expect(s.posted.filter((m) => m.type === "result")).toHaveLength(56); // 60 − 3 wrong-size − 1 ORT error
    // …and every run saw that frame's own pixels, written into the shared buffer (not a stale or separate copy).
    const red = (grey: number) => Math.fround((grey / 255 - 0.485) / 0.229);
    // 57 crops were read (grey 1…57); the 11th hit the ORT error, so the model ran on the other 56.
    const seen = Array.from({ length: 57 }, (_, k) => k + 1).filter((g) => g !== 11);
    expect(s.runs.map((r) => r.firstInput)).toEqual(seen.map(red));
  });
});

describe("pose worker: only accepts what it needs", () => {
  it("rejects anything that isn't a 224×224 crop, closes it, and never runs the model on it", async () => {
    const s = setup();
    await s.core.handle({ type: "load", url: "m.onnx", opts: { prefer: "wasm" } });
    const full = bitmap(960, 540);
    await s.core.handle(estimate(1, full));
    expect(full.close).toHaveBeenCalled();
    expect(s.runs).toHaveLength(0);
    expect(s.posted.at(-1)).toMatchObject({ type: "error", id: 1, message: "crop must be 224×224, got 960×540" });
  });

  it("closes the crop as soon as its pixels are read (POSE-08)", async () => {
    const s = setup();
    await s.core.handle({ type: "load", url: "m.onnx", opts: { prefer: "wasm" } });
    const crop = bitmap();
    await s.core.handle(estimate(1, crop));
    expect(crop.close).toHaveBeenCalledTimes(1);
    expect(s.ctx.drawImage).toHaveBeenCalledWith(crop, 0, 0);
  });

  it("skips a frame that arrives while one is running, so the shared buffer is never overwritten mid-run", async () => {
    let release!: () => void;
    const s = setup({ runDelay: () => new Promise<void>((r) => (release = r)) });
    await s.core.handle({ type: "load", url: "m.onnx", opts: { prefer: "wasm" } });
    const first = s.core.handle(estimate(1));
    await Promise.resolve();
    await s.core.handle(estimate(2));
    expect(s.posted.at(-1)).toMatchObject({ type: "error", id: 2, message: "busy", skipped: true });
    release();
    await first;
    expect(s.runs).toHaveLength(1);
    expect(s.posted.at(-1)).toMatchObject({ type: "result", id: 1 });
  });

  it("refuses frames before the model is loaded", async () => {
    const s = setup();
    await s.core.handle(estimate(1));
    expect(s.posted.at(-1)).toMatchObject({ type: "error", id: 1, message: "model not loaded" });
  });
});
