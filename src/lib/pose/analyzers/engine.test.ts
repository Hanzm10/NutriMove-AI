import { describe, expect, it } from "vitest";
import { buildAnalyzer, type ExerciseDef } from "./engine";
import { CUES, DEFAULT_RULES, rulesFor } from "./exercises";
import { repTrajectory, squatPose } from "./synthetic";

const FRAME = 1000 / 30;
const common = DEFAULT_RULES.common;
const base: ExerciseDef = {
  driver: { joints: ["hip", "knee", "ankle"], combine: "mean" },
  depthCode: "SQ_DEPTH",
  params: { top: 150, bottom: 95, shallowFloor: 135, lean: 30 },
  checks: [],
};
const build = (d: Partial<ExerciseDef>) => () => buildAnalyzer("squat", { ...base, ...d }, common, CUES);

/** Three reps down to `bottom`, with a pause at the top between them. */
function reps(bottom: number, lean = 10) {
  const out = [];
  let t = 0;
  for (let r = 0; r < 3; r++) {
    for (const k of repTrajectory(175, bottom, 2000)) out.push(squatPose(k, (t += FRAME), { lean }));
    for (let i = 0; i < 10; i++) out.push(squatPose(175, (t += FRAME)));
  }
  return out;
}

describe("exercise engine", () => {
  it("builds every exercise in exercise-rules.json, for every pose model", () => {
    for (const model of ["instanthmr", "mediapipe"] as const) {
      const rules = rulesFor(model);
      for (const kind of ["squat", "pushup", "lunge"] as const) expect(buildAnalyzer(kind, rules[kind], common, CUES).kind).toBe(kind);
    }
  });

  it("runs an exercise defined only as data: driver, thresholds and a check reading a param", () => {
    const a = build({ checks: [{ rule: "torsoLean", code: "SQ_TORSO_LEAN", below: "shallowFloor", max: "lean" }] })();
    const events = reps(80, 45).flatMap((p) => a.update(p));
    expect(a.reps).toBe(3);
    expect(events.filter((e) => e.type === "rep").every((e) => e.type === "rep" && e.errors.join() === "SQ_TORSO_LEAN")).toBe(true);
  });

  it("accepts literal settings as well as param names", () => {
    const a = build({ checks: [{ rule: "torsoLean", code: "SQ_TORSO_LEAN", below: "shallowFloor", max: 60 }] })();
    reps(80, 45).forEach((p) => a.update(p));
    expect(a.goodReps).toBe(3);
  });

  it("uses the driver's combine: 'min' follows the more bent leg", () => {
    const a = build({ driver: { joints: ["hip", "knee", "ankle"], combine: "min" } })();
    let t = 0;
    for (const k of repTrajectory(175, 80, 2000)) a.update(squatPose(175, (t += FRAME), { leftKnee: k }));
    for (let i = 0; i < 10; i++) a.update(squatPose(175, (t += FRAME)));
    expect(a.reps).toBe(1);
  });

  it("rejects a broken definition up front instead of failing mid-workout", () => {
    expect(build({ checks: [{ rule: "noSuchRule", code: "SQ_TORSO_LEAN" }] })).toThrow(/unknown rule "noSuchRule"/);
    expect(build({ checks: [{ rule: "torsoLean", code: "SQ_TORSO_LEAN", max: "nope" }] })).toThrow(/unknown param "nope"/);
    expect(build({ checks: [{ rule: "torsoLean", code: "SQ_TORSO_LEAN" }] })).toThrow(/missing setting "max"/);
    expect(build({ checks: [{ rule: "torsoLean", code: "NO_CUE", max: 30 }] })).toThrow(/no cue for "NO_CUE"/);
    expect(build({ checks: [{ rule: "torsoLean", code: "SQ_TORSO_LEAN", max: true }] })).toThrow(/should be a number/);
    expect(build({ checks: [{ rule: "torsoLean", code: "SQ_TORSO_LEAN", below: "nope", max: 30 }] })).toThrow(/unknown param "nope"/);
    expect(build({ driver: { joints: ["hip", "knee", "tail"], combine: "mean" } })).toThrow(/unknown joint "l_tail"/);
    expect(build({ driver: { joints: ["hip", "knee", "ankle"], combine: "median" } })).toThrow(/unknown driver combine/);
    expect(build({ params: { top: 150, bottom: 95 } })).toThrow(/shallowFloor must be a number/);
    expect(build({ gates: [{ rule: "noSuchGate" }] })).toThrow(/unknown gate "noSuchGate"/);
    expect(build({ gates: [{ rule: "bothLegsBend", on: "partial", max: "top" }] })).toThrow(/"on" must be "any" or "rep"/);
    expect(build({ gates: [{ rule: "hipsDrop", maxRatio: "nope" }] })).toThrow(/unknown param "nope"/);
    expect(build({ visible: { parts: ["tail"], min: 0.5 } })).toThrow(/unknown body part "tail"/);
    expect(build({ visible: { parts: ["knee"], min: "nope" } })).toThrow(/unknown param "nope"/);
  });
});
