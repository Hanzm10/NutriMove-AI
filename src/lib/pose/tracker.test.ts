import { describe, expect, it } from "vitest";
import { BODY_JOINTS } from "./instanthmr/skeleton";
import { BoxTracker } from "./tracker";

function joints(x1: number, y1: number, x2: number, y2: number) {
  const j = new Float32Array(140).fill(NaN);
  BODY_JOINTS.forEach((idx, k) => {
    j[idx * 2] = k % 2 ? x1 : x2;
    j[idx * 2 + 1] = k % 3 ? y1 : y2;
  });
  return j;
}

describe("BoxTracker", () => {
  it("starts centred, then follows the body joints", () => {
    const t = new BoxTracker();
    const start = t.current(640, 480);
    expect(start[3] - start[1]).toBeCloseTo(480 * 0.92);
    expect(t.update(joints(100, 50, 300, 450), 640, 480).tracking).toBe(true);
    expect(t.current(640, 480)).toEqual([100, 50, 300, 450]);
  });

  it("falls back to the centred box after repeated implausible frames", () => {
    const t = new BoxTracker(2);
    t.update(joints(100, 50, 300, 450), 640, 480);
    expect(t.update(joints(10, 10, 30, 30), 640, 480).tracking).toBe(false);
    expect(t.current(640, 480)).toEqual([100, 50, 300, 450]);
    t.update(joints(10, 10, 30, 30), 640, 480);
    expect(t.current(640, 480)[3] - t.current(640, 480)[1]).toBeCloseTo(480 * 0.92);
  });
});
