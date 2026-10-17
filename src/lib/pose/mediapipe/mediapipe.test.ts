import { describe, expect, it, vi } from "vitest";
import { MHR70, NUM_JOINTS } from "../instanthmr/skeleton";
import { BLAZEPOSE, blazePoseToMhr70, worldIsYDown, type Landmark } from "./adapter";
import { MediaPipePoseEstimator, type CreateLandmarker, type LandmarkerLike } from "./estimator";

/** 33 BlazePose landmarks of an upright person: image coords 0–1 (y down), world metres (y down, hip-centred). */
function standing(): { image: Landmark[]; world: Landmark[] } {
  const image: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const world: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.99 }));
  const put = (i: number, x: number, y: number, wy: number) => {
    image[i] = { x, y, z: 0, visibility: 0.95 };
    world[i] = { x: (x - 0.5) * 2, y: wy, z: 0.01 * i, visibility: 0.95 };
  };
  put(BLAZEPOSE.nose, 0.5, 0.1, -0.65);
  put(BLAZEPOSE.left_shoulder, 0.6, 0.25, -0.45); put(BLAZEPOSE.right_shoulder, 0.4, 0.25, -0.45);
  put(BLAZEPOSE.left_hip, 0.56, 0.5, 0); put(BLAZEPOSE.right_hip, 0.44, 0.5, 0);
  put(BLAZEPOSE.left_knee, 0.56, 0.7, 0.42); put(BLAZEPOSE.right_knee, 0.44, 0.7, 0.42);
  put(BLAZEPOSE.left_ankle, 0.56, 0.9, 0.85); put(BLAZEPOSE.right_ankle, 0.44, 0.9, 0.85);
  return { image, world };
}

describe("BlazePose → MHR70 adapter", () => {
  it("maps each joint to its MHR70 slot in frame pixels, and leaves unused slots empty", () => {
    const { image, world } = standing();
    const j = blazePoseToMhr70(image, world, 640, 480);
    expect(j.joints2d).toHaveLength(NUM_JOINTS * 2);
    expect([j.joints2d[MHR70.left_knee * 2], j.joints2d[MHR70.left_knee * 2 + 1]]).toEqual([0.56 * 640, 0.7 * 480].map(Math.fround));
    expect(j.joints2d[MHR70.right_ankle * 2 + 1]).toBeCloseTo(0.9 * 480, 3);
    expect(Number.isNaN(j.joints2d[1 * 2])).toBe(true); // MHR70 slot 1 has no BlazePose equivalent
  });

  it("uses the foot index as the big toe and the shoulder midpoint as the neck (2D and 3D)", () => {
    const { image, world } = standing();
    image[BLAZEPOSE.left_foot_index] = { x: 0.6, y: 0.95, z: 0, visibility: 0.9 };
    const j = blazePoseToMhr70(image, world, 1000, 1000);
    expect(j.joints2d[MHR70.left_big_toe * 2]).toBeCloseTo(600, 3);
    expect(j.joints2d[MHR70.neck * 2]).toBeCloseTo(500, 3);
    expect(j.joints2d[MHR70.neck * 2 + 1]).toBeCloseTo(250, 3);
    expect(j.joints3d![MHR70.neck * 3 + 1]).toBeCloseTo(-0.45, 5);
  });

  it("copies the metric world landmarks into the 3D slots, or returns no 3D without them", () => {
    const { image, world } = standing();
    const j = blazePoseToMhr70(image, world, 640, 480);
    expect(j.joints3d![MHR70.left_ankle * 3 + 1]).toBeCloseTo(0.85, 5);
    expect(blazePoseToMhr70(image, null, 640, 480).joints3d).toBeNull();
  });

  it("reports the lowest visibility among the body joints", () => {
    const { image, world } = standing();
    image[BLAZEPOSE.right_knee] = { ...image[BLAZEPOSE.right_knee]!, visibility: 0.31 };
    expect(blazePoseToMhr70(image, world, 640, 480).minVisibility).toBeCloseTo(0.31);
  });

  it("detects whether the 3D axes are Y-down (ankles below shoulders when standing)", () => {
    const { image, world } = standing();
    expect(worldIsYDown(blazePoseToMhr70(image, world, 640, 480).joints3d!)).toBe(true);
    const flipped = world.map((p) => ({ ...p, y: -p.y }));
    expect(worldIsYDown(blazePoseToMhr70(image, flipped, 640, 480).joints3d!)).toBe(false);
  });
});

function fakeLandmarker(found = true) {
  const calls: number[] = [];
  const lm: LandmarkerLike = {
    detectForVideo: vi.fn((_f: CanvasImageSource, ts: number) => {
      calls.push(ts);
      const { image, world } = standing();
      return found ? { landmarks: [image], worldLandmarks: [world] } : { landmarks: [], worldLandmarks: [] };
    }),
    close: vi.fn(),
  };
  return { lm, calls };
}

describe("MediaPipePoseEstimator", () => {
  it("falls back from the GPU to the CPU delegate when the GPU can't start", async () => {
    const { lm } = fakeLandmarker();
    const create: CreateLandmarker = vi.fn(async (_v, d) => {
      if (d === "GPU") throw new Error("WebGL2 unavailable");
      return lm;
    });
    const est = new MediaPipePoseEstimator("lite", "GPU", create);
    await expect(est.load()).resolves.toEqual({ backend: "mediapipe-lite (cpu)" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("returns canonical joints with 3D, and strictly increasing timestamps even within the same millisecond", async () => {
    const { lm, calls } = fakeLandmarker();
    const est = new MediaPipePoseEstimator("full", "GPU", async () => lm);
    await est.load();
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const a = est.estimate({} as CanvasImageSource, 640, 480, [0, 0, 640, 480]);
    est.estimate({} as CanvasImageSource, 640, 480, [0, 0, 640, 480]);
    now.mockRestore();
    expect(calls[1]).toBeGreaterThan(calls[0]!);
    expect(a.found).toBe(true);
    expect(a.pose!.joints3d!.l_ankle[1]).toBeCloseTo(0.85, 5);
    expect(a.pose!.joints2d.l_knee[0]).toBeCloseTo(0.56 * 640, 3);
  });

  it("reports no pose when nobody is in the frame", async () => {
    const { lm } = fakeLandmarker(false);
    const est = new MediaPipePoseEstimator("lite", "CPU", async () => lm);
    await est.load();
    const r = est.estimate({} as CanvasImageSource, 640, 480, [0, 0, 640, 480]);
    expect(r).toMatchObject({ found: false, pose: null });
  });

  it("closes the model on dispose and refuses frames afterwards", async () => {
    const { lm } = fakeLandmarker();
    const est = new MediaPipePoseEstimator("lite", "CPU", async () => lm);
    await est.load();
    est.dispose();
    expect(lm.close).toHaveBeenCalledTimes(1);
    expect(est.alive).toBe(false);
    expect(() => est.estimate({} as CanvasImageSource, 640, 480, [0, 0, 640, 480])).toThrow("not loaded");
  });
});
