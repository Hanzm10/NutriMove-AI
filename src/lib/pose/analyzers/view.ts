// Which way the user faces the camera (Phase 2, docs/pose-optimization-plan.md). Pure.
import type { CanonicalPose } from "../types";

/**
 * Shoulder width ÷ torso height in the image. About 0.6–0.7 when facing the camera, well under 0.45 side-on or at 45°
 * (measured on the team's clips with both pose models). Null when the torso is too small to measure.
 */
export function shoulderTorsoRatio(p: CanonicalPose): number | null {
  const k = p.joints2d;
  const sw = Math.hypot(k.l_shoulder[0] - k.r_shoulder[0], k.l_shoulder[1] - k.r_shoulder[1]);
  const th = Math.hypot(
    (k.l_shoulder[0] + k.r_shoulder[0]) / 2 - (k.l_hip[0] + k.r_hip[0]) / 2,
    (k.l_shoulder[1] + k.r_shoulder[1]) / 2 - (k.l_hip[1] + k.r_hip[1]) / 2,
  );
  return th > 1 && Number.isFinite(sw) ? sw / th : null;
}

/** Median of the last `size` values: robust to a few turned or glitchy frames. */
export class MedianWindow {
  private values: number[] = [];

  constructor(private readonly size = 45) {}

  push(v: number) {
    this.values.push(v);
    if (this.values.length > this.size) this.values.shift();
  }

  get median(): number | null {
    if (!this.values.length) return null;
    const s = this.values.toSorted((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  }
}
