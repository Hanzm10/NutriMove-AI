import type { Vec3 } from "./types";

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Vec3, b: Vec3) => norm(sub(a, b));
/** Distance ignoring the vertical (Y) axis. */
export const horizontalDist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

const deg = (rad: number) => (rad * 180) / Math.PI;

/** Angle at `b` formed by a–b–c, in degrees (0–180). */
export function angleAt(a: Vec3, b: Vec3, c: Vec3): number {
  const u = sub(a, b), v = sub(c, b);
  const d = norm(u) * norm(v);
  if (d === 0) return NaN;
  return deg(Math.acos(Math.max(-1, Math.min(1, dot(u, v) / d))));
}

/** Angle between a vector and straight up. InstantHMR is Y-down, so "up" is (0, -1, 0). */
export function angleFromVertical(v: Vec3): number {
  const n = norm(v);
  if (n === 0) return NaN;
  return deg(Math.acos(Math.max(-1, Math.min(1, -v[1] / n))));
}

/**
 * Signed offset of `p` from the line a→b, measured along Y (positive = below the line, since Y is down).
 * Used for push-up hip sag (+) / pike (−).
 */
export function verticalOffsetFromLine(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const len2 = ab[0] * ab[0] + ab[2] * ab[2];
  const t = len2 === 0 ? 0.5 : ((p[0] - a[0]) * ab[0] + (p[2] - a[2]) * ab[2]) / len2;
  const lineY = a[1] + t * ab[1];
  return p[1] - lineY;
}
