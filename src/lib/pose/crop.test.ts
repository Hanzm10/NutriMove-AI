import { describe, expect, it } from "vitest";
import { FrameCropper, planCrop } from "./crop";
import { INPUT_SIZE, squareCrop, type BBox } from "./instanthmr/preprocess";
import { fakeCanvasFactory } from "./test-fakes";

// The worker's clipping code before this change, kept here as the reference the main-thread crop must match.
function oldWorkerClip(box: BBox, fw: number, fh: number) {
  const sq = squareCrop(box);
  const sx = Math.max(0, sq.x), sy = Math.max(0, sq.y);
  const ex = Math.min(fw, sq.x + sq.size), ey = Math.min(fh, sq.y + sq.size);
  if (!(ex > sx && ey > sy)) return null;
  const k = INPUT_SIZE / sq.size;
  return [sx, sy, ex - sx, ey - sy, (sx - sq.x) * k, (sy - sq.y) * k, (ex - sx) * k, (ey - sy) * k];
}

describe("planCrop (main-thread crop maths)", () => {
  const cases: [string, BBox][] = [
    ["box inside the frame", [400, 100, 600, 500]],
    ["box past the left/top edge (black padding)", [-50, -40, 150, 400]],
    ["box past the right/bottom edge", [800, 300, 1000, 760]],
    ["box larger than the frame", [-200, -200, 1400, 900]],
  ];
  for (const [name, box] of cases) {
    it(`matches the old worker crop: ${name}`, () => {
      const plan = planCrop(box, 960, 540);
      expect(plan.src && plan.dst ? [...plan.src, ...plan.dst] : null).toEqual(oldWorkerClip(box, 960, 540));
    });
  }
  it("returns no source rect when the box is entirely off-frame", () => {
    expect(planCrop([2000, 2000, 2100, 2200], 960, 540).src).toBeNull();
  });
});

describe("FrameCropper", () => {
  it("crops from the live frame on the calling (main) thread into a 224×224 image", async () => {
    const { factory, made } = fakeCanvasFactory();
    const cropper = new FrameCropper(factory);
    const video = { tag: "video" } as unknown as CanvasImageSource;
    cropper.draw(video, 960, 540, [400, 100, 600, 500]);
    const [args] = made[0]!.draws;
    expect(args![0]).toBe(video); // drawn straight from the video element
    expect(args!.slice(1)).toEqual(oldWorkerClip([400, 100, 600, 500], 960, 540));
    const bmp = await cropper.bitmap();
    expect([bmp.width, bmp.height]).toEqual([INPUT_SIZE, INPUT_SIZE]);
  });

  it("creates its canvas once and reuses it for every frame", async () => {
    const { factory, made } = fakeCanvasFactory();
    const cropper = new FrameCropper(factory);
    for (let i = 0; i < 100; i++) {
      cropper.draw({} as CanvasImageSource, 960, 540, [400, 100, 600, 500]);
      await cropper.bitmap();
    }
    expect(factory).toHaveBeenCalledTimes(1);
    expect(made[0]!.draws).toHaveLength(100);
  });
});
