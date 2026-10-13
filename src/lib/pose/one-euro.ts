// 1€ filter (Casiez et al., CHI 2012) — speed-adaptive low-pass for jittery keypoints (POSE-06).
import { CANONICAL_JOINTS, type CanonicalPose, type JointName, type Vec2, type Vec3 } from "./types";

const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private t: number | null = null;

  constructor(private minCutoff = 1.0, private beta = 0.01, private dCutoff = 1.0) {}

  filter(value: number, timestampMs: number): number {
    if (this.x === null || this.t === null || !Number.isFinite(value)) {
      this.x = value;
      this.t = timestampMs;
      return value;
    }
    const dt = Math.max(1e-3, (timestampMs - this.t) / 1000);
    this.t = timestampMs;
    const rawDx = (value - this.x) / dt;
    this.dx = this.dx + alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x = this.x + alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.t = null;
    this.dx = 0;
  }
}

/** Smooths every coordinate of a CanonicalPose. 2D in pixels and 3D in metres need different betas. */
export class PoseSmoother {
  private f2 = new Map<string, OneEuroFilter>();
  private f3 = new Map<string, OneEuroFilter>();

  constructor(
    private readonly opts = { minCutoff: 1.0, beta2d: 0.005, beta3d: 0.5 },
  ) {}

  smooth(pose: CanonicalPose): CanonicalPose {
    const t = pose.timestamp;
    const j2 = {} as Record<JointName, Vec2>;
    const j3 = pose.joints3d ? ({} as Record<JointName, Vec3>) : null;
    for (const name of CANONICAL_JOINTS) {
      const p = pose.joints2d[name];
      j2[name] = [this.get(this.f2, `${name}x`, this.opts.beta2d).filter(p[0], t), this.get(this.f2, `${name}y`, this.opts.beta2d).filter(p[1], t)];
      if (j3 && pose.joints3d) {
        const q = pose.joints3d[name];
        j3[name] = [0, 1, 2].map((i) => this.get(this.f3, `${name}${i}`, this.opts.beta3d).filter(q[i]!, t)) as unknown as Vec3;
      }
    }
    return { ...pose, joints2d: j2, joints3d: j3 };
  }

  reset() {
    this.f2.clear();
    this.f3.clear();
  }

  private get(map: Map<string, OneEuroFilter>, key: string, beta: number) {
    let f = map.get(key);
    if (!f) map.set(key, (f = new OneEuroFilter(this.opts.minCutoff, beta)));
    return f;
  }
}
