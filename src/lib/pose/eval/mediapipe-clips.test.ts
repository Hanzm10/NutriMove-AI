// Phase 2 gate on the team's squat clips processed with MediaPipe Pose Landmarker full (joints only, no video).
// See docs/pose-optimization-plan.md. InstantHMR's own clips are covered by real-clips.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAnalyzer, rulesFor } from "../analyzers/exercises";
import { MedianWindow, shoulderTorsoRatio } from "../analyzers/view";
import { angleAt } from "../geometry";
import { analyzeClip, frameToPose, type ClipJoints } from "./replay";
import { parseLabelsCsv, scoreClips, type RepLabel } from "./score";

const load = (name: string) =>
  (JSON.parse(readFileSync(new URL(`../../../../eval/clips/${name}`, import.meta.url), "utf8")) as { clips: ClipJoints[] }).clips;
const labels = parseLabelsCsv(readFileSync(new URL("../../../../eval/clips/squat-day6.labels.csv", import.meta.url), "utf8"));
const mp = rulesFor("mediapipe");
const run = (clips: ClipJoints[]) =>
  clips.map((c) => ({ file: c.file, attempts: analyzeClip("squat", c.frames, (k) => createAnalyzer(k, mp)).attempts }));

/** Median shoulder/torso ratio over standing frames: the analyzer's camera-angle signal. */
function standingView(clip: ClipJoints) {
  const w = new MedianWindow(10_000);
  for (const f of clip.frames) {
    if (!f.v) continue;
    const p = frameToPose(f);
    const j = p.joints3d!;
    if ((angleAt(j.l_hip, j.l_knee, j.l_ankle) + angleAt(j.r_hip, j.r_knee, j.r_ankle)) / 2 < (mp.squat.params.top as number)) continue;
    const v = shoulderTorsoRatio(p);
    if (v != null) w.push(v);
  }
  return w.median!;
}

describe("camera angle detection", () => {
  it("tells facing-the-camera clips from side/45° clips, for both models", () => {
    const front = load("mediapipe-squat-front.joints.json").map(standingView);
    const side = [...load("mediapipe-squat-side.joints.json"), ...load("squat-day6.joints.json")].map(standingView);
    console.log("view ratio  front:", front.map((v) => v.toFixed(2)).join(" "), " side:", side.map((v) => v.toFixed(2)).join(" "));
    expect(Math.min(...front)).toBeGreaterThanOrEqual((mp.squat.params.frontViewMin as number));
    expect(Math.max(...side)).toBeLessThan((mp.squat.params.frontViewMin as number));
  });
});

describe("MediaPipe full, facing the camera (squat_good_10, squat_knees-in_10)", () => {
  const clips = load("mediapipe-squat-front.joints.json");
  const report = scoreClips(run(clips), labels);
  console.log("front", JSON.stringify({ reps: report.repAccuracy, macroF1: report.macroF1, classes: report.classes, clips: report.clips }));

  it("counts every rep and catches knee cave-in on every knees-in rep", () => {
    expect(report.unscored).toEqual([]);
    expect(report.repAccuracy).toBeGreaterThanOrEqual(0.9);
    const valgus = report.classes.find((c) => c.code === "SQ_KNEE_VALGUS")!;
    expect(valgus.recall).toBe(1);
    expect(valgus.precision).toBe(1);
  });

  it("flags nothing on the 10 good squats", () => {
    const good = run([clips.find((c) => c.file === "squat_good_10.mp4")!])[0]!;
    expect(good.attempts.filter((a) => a.counted)).toHaveLength(10);
    expect(good.attempts.flatMap((a) => a.errors)).toEqual([]);
  });
});

describe("MediaPipe full, side/45° (squat_good_12, squat_mixed_13)", () => {
  const clips = load("mediapipe-squat-side.joints.json");
  const runs = run(clips);
  // Knee cave-in isn't checked side-on with MediaPipe (its 3D can't see it; the coach asks users to face the camera),
  // so the "knees-in" labels are scored as "not checked by the app" here.
  const sideLabels = new Map<string, RepLabel[]>(
    [...labels].map(([k, reps]) => [k, reps.map((r) => ({ ...r, labels: r.labels.map((l) => (l === "knees-in" ? "knees-in (front view only)" : l)) }))]),
  );
  const report = scoreClips(runs, sideLabels);
  console.log("side", JSON.stringify({ reps: report.repAccuracy, macroF1: report.macroF1, classes: report.classes, clips: report.clips }));

  it("counts reps (≥ 90 %) and catches shallow squats", () => {
    expect(report.repAccuracy).toBeGreaterThanOrEqual(0.9);
    const depth = report.classes.find((c) => c.code === "SQ_DEPTH")!;
    expect(depth.f1).toBeGreaterThanOrEqual(0.75);
  });

  it("never raises a knee cave-in warning side-on (it can't be measured there)", () => {
    expect(runs.flatMap((r) => r.attempts.flatMap((a) => a.errors))).not.toContain("SQ_KNEE_VALGUS");
  });

  it("counts all 12 good squats as full reps", () => {
    const good = runs.find((r) => r.file === "squat_good_12.mp4")!;
    expect(good.attempts.filter((a) => a.counted && !a.errors.includes("SQ_DEPTH"))).toHaveLength(12);
  });
});
