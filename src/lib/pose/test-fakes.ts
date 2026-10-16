// Test doubles shared by the pose test suites (not used by the app).
import { vi } from "vitest";
import type { CropCanvas } from "./crop";
import type { LoadedModel } from "./instanthmr/session";

/** Fake 224×224 canvas: records draws, counts how often it is created. */
export function fakeCanvasFactory() {
  const made: { canvas: CropCanvas; draws: unknown[][]; fills: number }[] = [];
  const factory = vi.fn((size: number) => {
    const rec = { draws: [] as unknown[][], fills: 0, canvas: null as unknown as CropCanvas };
    const ctx = {
      fillStyle: "",
      fillRect: () => void rec.fills++,
      drawImage: (...args: unknown[]) => void rec.draws.push(args),
    };
    rec.canvas = {
      width: size,
      height: size,
      getContext: () => ctx,
      transferToImageBitmap: () => ({ width: size, height: size, close: vi.fn() }) as unknown as ImageBitmap,
      convertToBlob: async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
    };
    made.push(rec);
    return rec.canvas;
  });
  return { factory, made };
}

const ALL_OUTPUTS = ["mhr_params", "shape_params", "cam_trans", "joints_2d", "joints_3d"];

/** Fake ORT: counts tensor creation, records every session.run call, returns only what was asked for. */
export function fakeModel(outputNames = ALL_OUTPUTS) {
  const tensorsMade = vi.fn();
  class Tensor {
    constructor(readonly type: string, readonly data: Float32Array, readonly dims: number[]) {
      tensorsMade();
    }
  }
  /** firstInput: the input buffer's first value at the moment ORT ran (shows what pixels the model actually saw). */
  const runs: { feeds: Record<string, Tensor>; fetches: string[] | undefined; firstInput: number | undefined }[] = [];
  const session = {
    inputNames: ["image", "cliff_cond"],
    outputNames,
    run: vi.fn(async (feeds: Record<string, Tensor>, fetches?: string[]) => {
      runs.push({ feeds, fetches, firstInput: feeds.image?.data[0] });
      const names = fetches ?? outputNames;
      return Object.fromEntries(
        names.map((n) => [n, { getData: async () => new Float32Array(n.includes("3d") ? 210 : n.includes("2d") ? 140 : 8) }]),
      );
    }),
  };
  const model = {
    ort: { Tensor },
    session,
    backend: "wasm",
    inputNames: session.inputNames,
    outputNames,
  } as unknown as LoadedModel;
  return { model, session, runs, tensorsMade };
}

