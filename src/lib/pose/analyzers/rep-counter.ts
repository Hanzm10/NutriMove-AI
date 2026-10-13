import type { RepPhase } from "./types";

export type RepCounterConfig = {
  top: number;
  bottom: number;
  /** Going below this without reaching `bottom` and coming back up = a shallow (partial) rep. */
  shallowFloor: number;
  hysteresis: number;
  minRepMs: number;
  maxRepMs: number;
  minBottomFrames: number;
};

export type RepOutcome =
  | { kind: "rep"; minAngle: number; durationMs: number }
  | { kind: "partial"; minAngle: number }
  | null;

/**
 * TOP → DESCENDING → BOTTOM → ASCENDING → TOP = one rep (POSE-09). The signal is a joint angle that is
 * large at the top (standing / arms straight) and small at the bottom.
 */
export class RepCounter {
  phase: RepPhase = "top";
  private start = 0;
  private min = Infinity;
  private bottomFrames = 0;

  constructor(private readonly c: RepCounterConfig) {}

  update(angle: number, t: number): RepOutcome {
    if (!Number.isFinite(angle)) return null;
    const { top, bottom, hysteresis: h } = this.c;
    switch (this.phase) {
      case "top":
        if (angle < top - h) {
          this.phase = "descending";
          this.start = t;
          this.min = angle;
          this.bottomFrames = 0;
        }
        return null;
      case "descending":
        this.min = Math.min(this.min, angle);
        if (angle < bottom) {
          if (++this.bottomFrames >= this.c.minBottomFrames) this.phase = "bottom";
        } else this.bottomFrames = 0;
        if (angle > top) {
          this.phase = "top";
          return this.min < this.c.shallowFloor ? { kind: "partial", minAngle: this.min } : null;
        }
        return null;
      case "bottom":
        this.min = Math.min(this.min, angle);
        if (angle > bottom + h) this.phase = "ascending";
        return null;
      case "ascending":
        if (angle < bottom) {
          this.phase = "bottom";
          return null;
        }
        if (angle > top) {
          this.phase = "top";
          const durationMs = t - this.start;
          if (durationMs < this.c.minRepMs || durationMs > this.c.maxRepMs) return null;
          return { kind: "rep", minAngle: this.min, durationMs };
        }
        return null;
    }
  }

  /** True while the user is in the working part of a rep (below the top threshold). */
  get inRep() {
    return this.phase !== "top";
  }

  reset() {
    this.phase = "top";
    this.min = Infinity;
    this.bottomFrames = 0;
  }
}
