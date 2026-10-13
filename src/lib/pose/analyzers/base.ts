import type { CanonicalPose } from "../types";
import rules from "./exercise-rules.json";
import { RepCounter, type RepCounterConfig } from "./rep-counter";
import type { AnalyzerEvent, Cue, CueSeverity, ExerciseAnalyzer, ExerciseKind, FrameMetrics } from "./types";

const SEVERITY_RANK: Record<CueSeverity, number> = { safety: 0, depth: 1, posture: 2 };

export type AnalyzerSpec = {
  kind: ExerciseKind;
  counter: Omit<RepCounterConfig, "minRepMs" | "maxRepMs" | "minBottomFrames" | "hysteresis">;
  /** Code reported for shallow (partial) reps. */
  depthCode: string;
  cues: Record<string, Cue>;
  metrics: (pose: CanonicalPose) => FrameMetrics | null;
};

/** Shared rep counting, per-rep error collection and cue scheduling (POSE-09/12/13). */
export class BaseAnalyzer implements ExerciseAnalyzer {
  readonly kind: ExerciseKind;
  reps = 0;
  goodReps = 0;
  errorCounts: Record<string, number> = {};
  private counter: RepCounter;
  private repErrors = new Set<string>();
  private lastCueAt: Record<string, number> = {};
  private lastAnyCueAt = -Infinity;

  constructor(private readonly spec: AnalyzerSpec) {
    this.kind = spec.kind;
    const c = rules.common;
    this.counter = new RepCounter({
      ...spec.counter,
      hysteresis: c.hysteresis,
      minRepMs: c.minRepMs,
      maxRepMs: c.maxRepMs,
      minBottomFrames: c.minBottomFrames,
    });
  }

  get phase() {
    return this.counter.phase;
  }

  update(pose: CanonicalPose): AnalyzerEvent[] {
    const m = this.spec.metrics(pose);
    if (!m) return [];
    const t = pose.timestamp;
    const events: AnalyzerEvent[] = [];

    // Form checks only count while the user is inside a rep.
    if (this.counter.inRep) {
      const fresh = m.violations.filter((v) => !this.repErrors.has(v));
      fresh.forEach((v) => this.repErrors.add(v));
      const cue = this.pickCue(fresh, t);
      if (cue) events.push({ type: "cue", cue });
    }

    const outcome = this.counter.update(m.angle, t);
    if (outcome?.kind === "rep") {
      this.reps++;
      const errors = [...this.repErrors];
      if (errors.length === 0) this.goodReps++;
      errors.forEach((e) => (this.errorCounts[e] = (this.errorCounts[e] ?? 0) + 1));
      events.push({ type: "rep", index: this.reps, good: errors.length === 0, errors, minAngle: outcome.minAngle, durationMs: outcome.durationMs });
      this.repErrors.clear();
    } else if (outcome?.kind === "partial") {
      const errors = [this.spec.depthCode, ...this.repErrors];
      this.errorCounts[this.spec.depthCode] = (this.errorCounts[this.spec.depthCode] ?? 0) + 1;
      events.push({ type: "partial", errors, minAngle: outcome.minAngle });
      const cue = this.pickCue([this.spec.depthCode], t);
      if (cue) events.push({ type: "cue", cue });
      this.repErrors.clear();
    } else if (!this.counter.inRep) {
      this.repErrors.clear();
    }
    return events;
  }

  reset() {
    this.counter.reset();
    this.reps = 0;
    this.goodReps = 0;
    this.errorCounts = {};
    this.repErrors.clear();
    this.lastCueAt = {};
    this.lastAnyCueAt = -Infinity;
  }

  /** One cue at a time, most severe first, each code at most once per cooldown (POSE-12). */
  private pickCue(codes: string[], t: number): Cue | null {
    const cooldown = rules.common.cueCooldownMs;
    if (t - this.lastAnyCueAt < cooldown / 2) return null;
    const candidates = codes
      .map((c) => this.spec.cues[c])
      .filter((c): c is Cue => !!c && t - (this.lastCueAt[c.code] ?? -Infinity) >= cooldown)
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    const cue = candidates[0];
    if (!cue) return null;
    this.lastCueAt[cue.code] = t;
    this.lastAnyCueAt = t;
    return cue;
  }
}
