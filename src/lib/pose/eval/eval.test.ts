import { describe, expect, it } from "vitest";
import { repTrajectory, squatPose } from "../analyzers/synthetic";
import { analyzeClip, frameToPose, poseToFrame, type Attempt, type ClipFrame } from "./replay";
import { clipTruth, parseClipName, parseLabelsCsv, scoreClips } from "./score";

const FPS = 15;
const DT = 1000 / FPS;

/** A synthetic squat clip sampled like the replay page: 1.5 s standing, then reps (good / valgus / shallow). */
function squatClip(kinds: ("good" | "valgus" | "shallow")[]): ClipFrame[] {
  const frames: ClipFrame[] = [];
  let t = 0;
  const push = (k: number, opts = {}) => {
    frames.push(poseToFrame(squatPose(k, t, opts), t, true));
    t += DT;
  };
  for (let i = 0; i < 22; i++) push(175);
  for (const kind of kinds) {
    const bottom = kind === "shallow" ? 112 : 90;
    for (const k of repTrajectory(175, bottom, 2000, FPS)) push(k, kind === "valgus" && k < 120 ? { valgus: true } : {});
    for (let i = 0; i < 6; i++) push(175);
  }
  return frames;
}

describe("clip replay", () => {
  it("round-trips joints through the export format", () => {
    const pose = squatPose(130, 500);
    const back = frameToPose(poseToFrame(pose, 500, true));
    expect(back.timestamp).toBe(500);
    expect(back.joints3d!.l_knee[1]).toBeCloseTo(pose.joints3d!.l_knee[1], 3);
    expect(back.joints2d.r_ankle[0]).toBeCloseTo(pose.joints2d.r_ankle[0], 0);
  });

  it("counts reps and flags errors like the live coach (ready gate, partials)", () => {
    const r = analyzeClip("squat", squatClip(["good", "valgus", "shallow", "good"]));
    expect(r.reps).toBe(3);
    expect(r.partials).toBe(1);
    expect(r.attempts.map((a) => a.counted)).toEqual([true, true, false, true]);
    expect(r.attempts[1]!.errors).toContain("SQ_KNEE_VALGUS");
    expect(r.attempts[2]!.errors).toContain("SQ_DEPTH");
    expect(r.attempts[0]!.errors).toEqual([]);
  });

  it("ignores frames where the person was not tracked", () => {
    const frames = squatClip(["good", "good"]).map((f) => ({ ...f, v: 0 as const }));
    expect(analyzeClip("squat", frames).attempts).toHaveLength(0);
  });
});

describe("scoring", () => {
  it("parses clip names", () => {
    expect(parseClipName("squat_knees-in_10.mp4")).toEqual({ exercise: "squat", label: "knees-in", reps: 10 });
    expect(parseClipName("C:\\clips\\Push-up_Hips-sag_8.MOV")).toEqual({ exercise: "pushup", label: "hips-sag", reps: 8 });
    expect(parseClipName("lunge_good_12.joints.json")).toEqual({ exercise: "lunge", label: "good", reps: 12 });
    expect(parseClipName("random.mp4")).toBeNull();
  });

  it("reads labels.csv and falls back to the file name", () => {
    const csv = parseLabelsCsv("file,rep,errors\nsquat_mixed_3.mp4,2,knees-in+shallow\nsquat_mixed_3.mp4,1,good\nsquat_mixed_3.mp4,3,Heels-Up\n");
    expect(clipTruth("squat_mixed_3.joints.json", csv)!.reps).toEqual([
      { rep: 1, labels: [] }, { rep: 2, labels: ["knees-in", "shallow"] }, { rep: 3, labels: ["heels-up"] },
    ]);
    expect(clipTruth("squat_good_2.mp4", csv)!.reps).toEqual([{ rep: 1, labels: [] }, { rep: 2, labels: [] }]);
    expect(clipTruth("squat_mixed_5.mp4", csv)).toBeNull(); // mixed without labels can't be scored
  });

  it("computes rep accuracy and per-check F1", () => {
    const a = (counted: boolean, ...errors: string[]): Attempt => ({ index: 0, counted, errors, tMs: 0 });
    const csv = parseLabelsCsv("squat_mixed_4.mp4,1,good\nsquat_mixed_4.mp4,2,knees-in\nsquat_mixed_4.mp4,3,shallow\nsquat_mixed_4.mp4,4,heels-up");
    const report = scoreClips(
      [
        { file: "squat_mixed_4.joints.json", attempts: [a(true), a(true, "SQ_KNEE_VALGUS"), a(false, "SQ_DEPTH"), a(true, "SQ_KNEE_VALGUS")] },
        { file: "squat_good_2.joints.json", attempts: [a(true), a(true), a(true)] },
        { file: "notes.json", attempts: [] },
      ],
      csv,
    );
    expect(report.clips.map((c) => c.repAccuracy)).toEqual([1, 0.5]);
    expect(report.repAccuracy).toBe(0.75);
    const valgus = report.classes.find((c) => c.code === "SQ_KNEE_VALGUS")!;
    expect([valgus.tp, valgus.fp, valgus.fn]).toEqual([1, 1, 0]);
    expect(valgus.f1).toBeCloseTo(2 / 3);
    const depth = report.classes.find((c) => c.code === "SQ_DEPTH")!;
    expect(depth.f1).toBe(1);
    expect(report.macroF1).toBeCloseTo((2 / 3 + 1) / 2);
    expect(report.clips[0]!.unchecked).toEqual(["heels-up"]);
    expect(report.unscored).toEqual(["notes.json"]);
  });
});

describe("label names", () => {
  it("accepts hip-sag as well as hips-sag", () => {
    const report = scoreClips(
      [{ file: "pushup_hip-sag_1.joints.json", attempts: [{ index: 1, counted: true, errors: ["PU_HIP_SAG"], tMs: 0 }] }],
      new Map(),
    );
    expect(report.classes.find((c) => c.code === "PU_HIP_SAG")?.tp).toBe(1);
  });
});
