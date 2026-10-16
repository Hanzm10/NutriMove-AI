// Main-thread crop (POSE-02): the person is cut out of the camera frame here, so only a 224×224 image ever leaves
// the main thread, for the pose worker or the laptop coach. One canvas per cropper, reused for every frame.
import { INPUT_SIZE, cliffCond, squareCrop, type BBox, type SquareCrop } from "./instanthmr/preprocess";

export type Rect = readonly [x: number, y: number, w: number, h: number];
/** Where to copy from the frame (`src`) and where it lands in the 224×224 crop (`dst`). Null when the box is off-frame. */
export type CropPlan = { sq: SquareCrop; src: Rect | null; dst: Rect | null };

/** Square crop around the box, clipped to the frame; the part outside the frame stays black (matches cv2 padding). */
export function planCrop(box: BBox, frameW: number, frameH: number, size = INPUT_SIZE): CropPlan {
  const sq = squareCrop(box);
  const sx = Math.max(0, sq.x), sy = Math.max(0, sq.y);
  const ex = Math.min(frameW, sq.x + sq.size), ey = Math.min(frameH, sq.y + sq.size);
  if (!(ex > sx && ey > sy)) return { sq, src: null, dst: null };
  const k = size / sq.size;
  return { sq, src: [sx, sy, ex - sx, ey - sy], dst: [(sx - sq.x) * k, (sy - sq.y) * k, (ex - sx) * k, (ey - sy) * k] };
}

type Ctx2D = Pick<CanvasRenderingContext2D, "drawImage" | "fillRect"> & { fillStyle: CanvasRenderingContext2D["fillStyle"] };
export type CropCanvas = {
  width: number;
  height: number;
  getContext(id: "2d"): unknown;
  transferToImageBitmap?: () => ImageBitmap;
  convertToBlob?: (o: { type: string; quality: number }) => Promise<Blob>;
  toBlob?: (cb: (b: Blob | null) => void, type: string, quality: number) => void;
};

/** OffscreenCanvas where available (no DOM node); a detached <canvas> on older Safari. */
export function defaultCropCanvas(size = INPUT_SIZE): CropCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(size, size) as unknown as CropCanvas;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c as unknown as CropCanvas;
}

export class FrameCropper {
  private readonly canvas: CropCanvas;
  private readonly ctx: Ctx2D;

  constructor(makeCanvas: (size: number) => CropCanvas = defaultCropCanvas, readonly size = INPUT_SIZE) {
    this.canvas = makeCanvas(size);
    this.ctx = this.canvas.getContext("2d") as Ctx2D;
  }

  /** Draws the person crop from the live frame into the reused canvas. Returns what's needed to map joints back. */
  draw(source: CanvasImageSource, frameW: number, frameH: number, box: BBox) {
    const plan = planCrop(box, frameW, frameH, this.size);
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.size, this.size);
    if (plan.src && plan.dst) this.ctx.drawImage(source, ...plan.src, ...plan.dst);
    return { sq: plan.sq, cliff: cliffCond(box, frameW, frameH) };
  }

  /** The crop as a transferable 224×224 bitmap (moved out of the canvas without a copy where supported). */
  async bitmap(): Promise<ImageBitmap> {
    if (this.canvas.transferToImageBitmap) return this.canvas.transferToImageBitmap();
    return createImageBitmap(this.canvas as unknown as HTMLCanvasElement);
  }

  /** The crop as JPEG bytes (laptop coach). */
  async jpeg(quality: number): Promise<Uint8Array> {
    const blob = this.canvas.convertToBlob
      ? await this.canvas.convertToBlob({ type: "image/jpeg", quality })
      : await new Promise<Blob | null>((r) => this.canvas.toBlob!(r, "image/jpeg", quality));
    if (!blob) throw new Error("Could not encode the camera crop");
    return new Uint8Array(await blob.arrayBuffer());
  }
}
