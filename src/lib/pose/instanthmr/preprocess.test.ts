import { describe, expect, it } from "vitest";
import {
  bboxFromJoints, cliffCond, cropJointsToFrame, rgbaToNormalizedChw, squareCrop,
} from "./preprocess";

describe("InstantHMR preprocessing (matches inference.py)", () => {
  it("builds a 1.2× square crop around the box centre", () => {
    expect(squareCrop([100, 50, 200, 450])).toEqual({ x: -90, y: 10, size: 480 });
  });

  it("uses the pixel-form CLIFF condition", () => {
    const c = cliffCond([100, 50, 200, 450], 640, 480);
    expect(c[0]).toBeCloseTo((2 * 150) / 640 - 1);
    expect(c[1]).toBeCloseTo((2 * 250) / 480 - 1);
    expect(c[2]).toBeCloseTo(400 / 640);
  });

  it("normalises RGBA to ImageNet CHW", () => {
    const px = new Uint8ClampedArray([255, 0, 128, 255]);
    const t = rgbaToNormalizedChw(px, 1);
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229);
    expect(t[1]).toBeCloseTo((0 - 0.456) / 0.224);
    expect(t[2]).toBeCloseTo((128 / 255 - 0.406) / 0.225);
  });

  it("maps [-1, 1] crop joints back to frame pixels", () => {
    const out = cropJointsToFrame(new Float32Array([-1, -1, 1, 1, 0, 0]), { x: 10, y: 20, size: 448 });
    expect(Array.from(out)).toEqual([10, 20, 458, 468, 234, 244]);
  });

  it("derives a clamped tracking box from joints", () => {
    const j = new Float32Array([-5, 10, 100, 300, 50, 150]);
    expect(bboxFromJoints(j, [0, 1, 2], 640, 480)).toEqual([0, 10, 100, 300]);
    expect(bboxFromJoints(j, [2], 640, 480)).toBeNull();
  });

  it("writes into a caller's buffer instead of allocating a new one", () => {
    const rgba = new Uint8ClampedArray(2 * 2 * 4).fill(128);
    const buf = new Float32Array(3 * 2 * 2);
    const a = rgbaToNormalizedChw(rgba, 2, buf);
    const b = rgbaToNormalizedChw(rgba, 2, buf);
    expect(a).toBe(buf);
    expect(b).toBe(buf);
    expect(Array.from(buf)).toEqual(Array.from(rgbaToNormalizedChw(rgba, 2)));
    expect(() => rgbaToNormalizedChw(rgba, 2, new Float32Array(5))).toThrow("input buffer must hold 12 floats");
  });
});
