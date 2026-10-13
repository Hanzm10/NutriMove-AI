import { describe, expect, it } from "vitest";
import { createAnalyzer } from "./exercises";
import { RepCounter } from "./rep-counter";
import { pushupPose, repTrajectory, squatPose } from "./synthetic";
import type { AnalyzerEvent } from "./types";

const FRAME = 1000 / 30;

function run(kind: "squat" | "pushup" | "lunge", poses: ReturnType<typeof squatPose>[]) {
  const a = createAnalyzer(kind);
  const events: AnalyzerEvent[] = poses.flatMap((p) => a.update(p));
  return { a, events, cues: events.filter((e) => e.type === "cue").map((e) => (e as { cue: { code: string } }).cue.code) };
}

function squatSet(reps: number, bottom: number, opts: Parameters<typeof squatPose>[2] = {}, ms = 2000) {
  const out: ReturnType<typeof squatPose>[] = [];
  let t = 0;
  for (let r = 0; r < reps; r++) {
    for (const k of repTrajectory(175, bottom, ms)) out.push(squatPose(k, (t += FRAME), k < 120 ? opts : {}));
    for (let i = 0; i < 10; i++) out.push(squatPose(175, (t += FRAME))); // pause at the top
  }
  return out;
}

describe("RepCounter", () => {
  const cfg = { top: 160, bottom: 100, shallowFloor: 120, hysteresis: 10, minRepMs: 600, maxRepMs: 8000, minBottomFrames: 2 };
  it("counts a full rep and ignores jitter around the top", () => {
    const c = new RepCounter(cfg);
    const out = [175, 158, 152, 165, 172].map((a, i) => c.update(a, i * 33));
    expect(out.filter(Boolean)).toHaveLength(0);
    let t = 1000, rep = null;
    for (const a of repTrajectory(175, 90, 2000)) rep = c.update(a, (t += 33)) ?? rep;
    expect(rep).toMatchObject({ kind: "rep" });
    expect((rep as { minAngle: number }).minAngle).toBeLessThan(92);
  });
  it("reports a shallow rep as partial and rejects too-fast bounces", () => {
    const c = new RepCounter(cfg);
    let t = 0, res = null;
    for (const a of repTrajectory(175, 110, 2000)) res = c.update(a, (t += 33)) ?? res;
    expect(res).toMatchObject({ kind: "partial" });
    const fast = new RepCounter(cfg);
    let r2 = null;
    for (const a of repTrajectory(175, 90, 300, 60)) r2 = fast.update(a, (t += 5)) ?? r2;
    expect(r2).toBeNull();
  });
});

describe("squat analyzer (POSE-10)", () => {
  it("counts 5 clean reps as good with no cues", () => {
    const { a, cues } = run("squat", squatSet(5, 90));
    expect(a.reps).toBe(5);
    expect(a.goodReps).toBe(5);
    expect(cues).toEqual([]);
  });
  it("flags shallow squats with a depth cue and does not count them", () => {
    const { a, cues, events } = run("squat", squatSet(2, 110));
    expect(a.reps).toBe(0);
    expect(events.filter((e) => e.type === "partial")).toHaveLength(2);
    expect(cues).toContain("SQ_DEPTH");
  });
  it("cues knees caving in, during the rep", () => {
    const { a, events } = run("squat", squatSet(1, 90, { valgus: true }));
    const cueIdx = events.findIndex((e) => e.type === "cue");
    const repIdx = events.findIndex((e) => e.type === "rep");
    expect(cueIdx).toBeGreaterThanOrEqual(0);
    expect(cueIdx).toBeLessThan(repIdx); // cue arrives before the rep completes
    expect(a.goodReps).toBe(0);
    expect(a.errorCounts.SQ_KNEE_VALGUS).toBe(1);
  });
  it("cues excessive forward lean", () => {
    const { cues } = run("squat", squatSet(1, 90, { lean: 60 }));
    expect(cues).toContain("SQ_TORSO_LEAN");
  });
  it("rate-limits repeated cues (2 s cooldown)", () => {
    const { cues } = run("squat", squatSet(3, 90, { valgus: true }, 1000));
    expect(cues.filter((c) => c === "SQ_KNEE_VALGUS").length).toBeLessThan(3);
  });
});

describe("push-up analyzer (POSE-11)", () => {
  function set(reps: number, bottom: number, hipDrop = 0) {
    const out: ReturnType<typeof pushupPose>[] = [];
    let t = 0;
    for (let r = 0; r < reps; r++) {
      for (const e of repTrajectory(170, bottom, 1800)) out.push(pushupPose(e, (t += FRAME), { hipDrop }));
      for (let i = 0; i < 8; i++) out.push(pushupPose(170, (t += FRAME), { hipDrop }));
    }
    return out;
  }
  it("counts clean push-ups", () => {
    const { a, cues } = run("pushup", set(4, 80));
    expect(a.reps).toBe(4);
    expect(a.goodReps).toBe(4);
    expect(cues).toEqual([]);
  });
  it("detects sagging and piking hips", () => {
    expect(run("pushup", set(1, 80, 0.2)).cues).toContain("PU_HIP_SAG");
    expect(run("pushup", set(1, 80, -0.2)).cues).toContain("PU_HIP_PIKE");
  });
});

describe("lunge analyzer (POSE-11)", () => {
  it("counts reps on the more bent (front) knee", () => {
    const poses: ReturnType<typeof squatPose>[] = [];
    let t = 0;
    for (let r = 0; r < 3; r++) {
      for (const k of repTrajectory(175, 90, 2000)) poses.push(squatPose(175, (t += FRAME), { leftKnee: k }));
      for (let i = 0; i < 8; i++) poses.push(squatPose(175, (t += FRAME)));
    }
    const { a } = run("lunge", poses);
    expect(a.reps).toBe(3);
  });
});
