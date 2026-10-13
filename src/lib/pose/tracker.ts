import { BODY_JOINTS } from "./instanthmr/skeleton";
import { bboxFromJoints, initialBox, type BBox } from "./instanthmr/preprocess";

/**
 * Person box for the next frame: a tight box around the previous frame's body joints
 * (InstantHMR's detector-stride trick, PRD §7.7.1). Falls back to a centred box when tracking is lost.
 */
export class BoxTracker {
  private box: BBox | null = null;
  private misses = 0;

  constructor(private readonly maxMisses = 5) {}

  current(frameW: number, frameH: number): BBox {
    return this.box ?? initialBox(frameW, frameH);
  }

  update(joints2d: Float32Array, frameW: number, frameH: number): { tracking: boolean } {
    const next = bboxFromJoints(joints2d, BODY_JOINTS, frameW, frameH);
    // A box that is tiny relative to the frame means the model is hallucinating on background.
    const plausible = next && (next[3] - next[1]) > frameH * 0.2;
    if (plausible) {
      this.box = next;
      this.misses = 0;
      return { tracking: true };
    }
    this.misses++;
    if (this.misses >= this.maxMisses) this.box = null;
    return { tracking: false };
  }

  reset() {
    this.box = null;
    this.misses = 0;
  }
}
