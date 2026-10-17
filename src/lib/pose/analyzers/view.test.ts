import { describe, expect, it } from "vitest";
import { squatPose } from "./synthetic";
import { DEFAULT_RULES, rulesFor } from "./exercises";
import { MedianWindow, shoulderTorsoRatio } from "./view";
import type { CanonicalPose, JointName, Vec2 } from "../types";

const turned = (p: CanonicalPose, k: number): CanonicalPose => {
  // Squash the image horizontally around the hips, as if the person rotated away from the camera.
  const cx = (p.joints2d.l_hip[0] + p.joints2d.r_hip[0]) / 2;
  const j2 = Object.fromEntries(Object.entries(p.joints2d).map(([n, [x, y]]) => [n, [cx + (x - cx) * k, y] as Vec2])) as Record<JointName, Vec2>;
  return { ...p, joints2d: j2 };
};

describe("camera angle signal", () => {
  it("is larger facing the camera than side-on", () => {
    const front = shoulderTorsoRatio(squatPose(175, 0))!;
    const side = shoulderTorsoRatio(turned(squatPose(175, 0), 0.3))!;
    expect(front).toBeGreaterThan(side * 2);
  });

  it("takes the median of the window, so a few odd frames don't change it", () => {
    const w = new MedianWindow(5);
    expect(w.median).toBeNull();
    [0.3, 0.3, 0.9, 0.3, 0.3, 0.3].forEach((v) => w.push(v));
    expect(w.median).toBe(0.3);
    const even = new MedianWindow(4);
    [1, 2, 3, 4].forEach((v) => even.push(v));
    expect(even.median).toBe(2.5);
  });
});

describe("thresholds per pose model", () => {
  it("InstantHMR uses the base values; MediaPipe overrides only what was re-tuned", () => {
    expect(rulesFor("instanthmr")).toBe(DEFAULT_RULES);
    const mp = rulesFor("mediapipe");
    expect(mp.squat.params).toMatchObject({ top: 155, bottom: 110, shallowFloor: 145, torsoLeanMax: 70, valgusSide: false });
    expect(mp.squat.params.valgusFrontMax).toBe(DEFAULT_RULES.squat.params.valgusFrontMax);
    expect(mp.squat.checks).toBe(DEFAULT_RULES.squat.checks);
    expect(mp.lunge).toEqual(DEFAULT_RULES.lunge);
    expect(mp.common).toEqual(DEFAULT_RULES.common);
  });
});
