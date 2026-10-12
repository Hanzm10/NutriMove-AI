// Port of InstantHMR's _preprocess / predict (instanthmr/inference.py) — keep in sync.

export const INPUT_SIZE = 224;
export const CROP_EXPAND = 1.2;
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

/** [x1, y1, x2, y2] in full-frame pixels. */
export type BBox = readonly [number, number, number, number];
export type SquareCrop = { x: number; y: number; size: number };

/** Square crop of 1.2 × max(w, h) centred on the box (may extend past the frame; pad black). */
export function squareCrop([x1, y1, x2, y2]: BBox): SquareCrop {
  const size = Math.max(x2 - x1, y2 - y1) * CROP_EXPAND;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return { x: cx - size / 2, y: cy - size / 2, size };
}

/**
 * CLIFF conditioning vector. The released instanthmr.onnx has no `cliff_focal` metadata, so the
 * reference code uses the pixel form: [2cx/W − 1, 2cy/H − 1, max(bw, bh) / max(W, H)].
 */
export function cliffCond([x1, y1, x2, y2]: BBox, frameW: number, frameH: number): Float32Array {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return new Float32Array([
    (2 * cx) / frameW - 1,
    (2 * cy) / frameH - 1,
    Math.max(x2 - x1, y2 - y1) / Math.max(frameW, frameH),
  ]);
}

/** RGBA pixels of the 224×224 crop → ImageNet-normalised CHW float tensor data. */
export function rgbaToNormalizedChw(rgba: Uint8ClampedArray, size = INPUT_SIZE): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    out[i] = (rgba[p]! / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    out[plane + i] = (rgba[p + 1]! / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    out[2 * plane + i] = (rgba[p + 2]! / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }
  return out;
}

/** joints_2d in [-1, 1] crop space → full-frame pixels (flat [x0, y0, x1, y1, …]). */
export function cropJointsToFrame(norm: Float32Array, crop: SquareCrop): Float32Array {
  const out = new Float32Array(norm.length);
  const scale = crop.size / INPUT_SIZE;
  for (let i = 0; i < norm.length; i += 2) {
    out[i] = (norm[i]! + 1) * 0.5 * INPUT_SIZE * scale + crop.x;
    out[i + 1] = (norm[i + 1]! + 1) * 0.5 * INPUT_SIZE * scale + crop.y;
  }
  return out;
}

/** Tight box around the given joints (frame pixels), clamped to the frame. Null if degenerate. */
export function bboxFromJoints(
  joints2d: Float32Array,
  indices: readonly number[],
  frameW: number,
  frameH: number,
): BBox | null {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const j of indices) {
    const x = joints2d[j * 2]!, y = joints2d[j * 2 + 1]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
  }
  x1 = Math.max(0, x1); y1 = Math.max(0, y1); x2 = Math.min(frameW, x2); y2 = Math.min(frameH, y2);
  if (!(x2 - x1 > 8 && y2 - y1 > 8)) return null;
  return [x1, y1, x2, y2];
}

/** Starting box before any detection: a centred, person-shaped region. */
export function initialBox(frameW: number, frameH: number): BBox {
  const h = frameH * 0.92;
  const w = Math.min(frameW, h * 0.55);
  return [(frameW - w) / 2, (frameH - h) / 2, (frameW + w) / 2, (frameH + h) / 2];
}
