// Phase 3 edge cases (docs/pose-optimization-plan.md): movements that bend the driver joint without being the exercise.
import { describe, expect, it } from "vitest";
import type { CanonicalPose, JointName } from "../types";
import { createAnalyzer, rulesFor, type PoseModel } from "./exercises";
import { repTrajectory, squatPose } from "./synthetic";
import type { AnalyzerEvent, ExerciseKind } from "./types";

const FRAME = 1000 / 30;
const MODELS: PoseModel[] = ["instanthmr", "mediapipe"];

/** `n` movements built by `pose(angle, t)`, each top → bottom → top over 2 s, with standing frames before and between. */
function movements(n: number, bottom: number, pose: (k: number, t: number) => CanonicalPose) {
  const out: CanonicalPose[] = [];
  let t = 0;
  const stand = () => { for (let i = 0; i < 30; i++) out.push(squatPose(175, (t += FRAME))); };
  stand();
  for (let r = 0; r < n; r++) {
    for (const k of repTrajectory(175, bottom, 2000)) out.push(pose(k, (t += FRAME)));
    stand();
  }
  return out;
}

function run(kind: ExerciseKind, model: PoseModel, poses: CanonicalPose[]) {
  const a = createAnalyzer(kind, rulesFor(model));
  const events: AnalyzerEvent[] = poses.flatMap((p) => a.update(p));
  const of = <T extends AnalyzerEvent["type"]>(type: T) => events.filter((e): e is Extract<AnalyzerEvent, { type: T }> => e.type === type);
  return { a, reps: of("rep"), partials: of("partial"), ignored: of("ignored"), cues: of("cue").map((e) => e.cue.code) };
}

/** Same 3D pose, but the hips stay at standing height in the image (e.g. lying down, or sitting and kicking). */
function hipsStay(p: CanonicalPose): CanonicalPose {
  const stand = squatPose(175, p.timestamp).joints2d;
  const j2 = { ...p.joints2d };
  for (const n of ["l_ankle", "r_ankle", "l_heel", "r_heel", "l_big_toe", "r_big_toe"] as JointName[]) j2[n] = stand[n];
  return { ...p, joints2d: j2 };
}

describe.each(MODELS)("edge cases with %s thresholds", (model) => {
  it("still counts ordinary squats and lunges (the gates pass)", () => {
    expect(run("squat", model, movements(3, 80, (k, t) => squatPose(k, t))).reps).toHaveLength(3);
    expect(run("lunge", model, movements(3, 80, (k, t) => squatPose(k, t))).reps).toHaveLength(3);
  });

  it("one knee raised is never a squat: not a rep, not a shallow squat, no 'go deeper' cue", () => {
    const r = run("squat", model, movements(3, 40, (k, t) => squatPose(175, t, { leftKnee: k })));
    expect(r.reps).toHaveLength(0);
    expect(r.partials).toHaveLength(0);
    expect(r.cues).not.toContain("SQ_DEPTH");
    expect(r.ignored.map((e) => e.gate)).toEqual(["bothLegsBend", "bothLegsBend", "bothLegsBend"]);
  });

  it("one knee raised is never a lunge rep (lunges follow the more bent knee, so this used to count)", () => {
    const r = run("lunge", model, movements(3, 40, (k, t) => squatPose(175, t, { leftKnee: k })));
    expect(r.reps).toHaveLength(0);
    expect(r.ignored).toHaveLength(3);
  });

  it("both knees bending while the hips stay up is not a rep", () => {
    const r = run("squat", model, movements(3, 80, (k, t) => hipsStay(squatPose(k, t))));
    expect(r.reps).toHaveLength(0);
    expect(r.ignored.map((e) => e.gate)).toEqual(["hipsDrop", "hipsDrop", "hipsDrop"]);
  });

  it("the hip rule only voids full reps, so a shallow squat still gets the depth cue", () => {
    const shallow = model === "mediapipe" ? 130 : 120;
    const r = run("squat", model, movements(1, shallow, (k, t) => hipsStay(squatPose(k, t))));
    expect(r.partials).toHaveLength(1);
    expect(r.cues).toContain("SQ_DEPTH");
  });
});

describe("visibility gate", () => {
  const withVisibility = (v: Partial<Record<JointName, number>>) => (k: number, t: number) => ({ ...squatPose(k, t), visibility: v });

  it("skips frames where a needed body part is out of view (feet cut off), so nothing is counted", () => {
    const r = run("squat", "mediapipe", movements(3, 80, withVisibility({ l_ankle: 0.1, r_ankle: 0.2 })));
    expect(r.reps).toHaveLength(0);
    expect(r.a.phase).toBe("top");
  });

  it("needs only one side in view, so side-on filming (far leg hidden) still counts", () => {
    const r = run("squat", "mediapipe", movements(3, 80, withVisibility({ l_ankle: 0.1, l_knee: 0.2, l_hip: 0.3, r_ankle: 0.9 })));
    expect(r.reps).toHaveLength(3);
  });

  it("ignores body parts the exercise doesn't use, and poses without visibility (InstantHMR)", () => {
    expect(run("squat", "mediapipe", movements(3, 80, withVisibility({ l_wrist: 0, r_wrist: 0 }))).reps).toHaveLength(3);
    expect(run("squat", "instanthmr", movements(3, 80, (k, t) => squatPose(k, t))).reps).toHaveLength(3);
  });
});
