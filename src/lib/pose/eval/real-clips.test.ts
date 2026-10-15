// Regression on the team's labelled clips (joints only, no video). See docs/evaluation.md.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeClip, type ClipJoints } from "./replay";

const load = (name: string) =>
  (JSON.parse(readFileSync(new URL(`../../../../eval/clips/${name}`, import.meta.url), "utf8")) as { clips: ClipJoints[] }).clips;

describe("squat clips (Day 6)", () => {
  const clips = load("squat-day6.joints.json");
  const byName = (f: string) => clips.find((c) => c.file === f)!;

  it("counts all 12 good squats and flags none of them", () => {
    const r = analyzeClip("squat", byName("squat_good_12.mp4").frames);
    expect(r.reps).toBe(12);
    expect(r.attempts.every((a) => a.counted && a.errors.length === 0)).toBe(true);
  });

  it("sees every one of the 13 attempts in the mixed clip, most of them shallow", () => {
    const r = analyzeClip("squat", byName("squat_mixed_13.mp4").frames);
    expect(r.attempts).toHaveLength(13);
    expect(r.attempts.filter((a) => a.errors.includes("SQ_DEPTH")).length).toBeGreaterThanOrEqual(9);
    expect(r.attempts.some((a) => a.errors.includes("SQ_KNEE_VALGUS"))).toBe(true);
    expect(r.attempts.some((a) => a.errors.includes("SQ_TORSO_LEAN"))).toBe(true);
  });
});

describe("lunge clips (Day 6)", () => {
  it("counts all 15 good lunges and flags none of them", () => {
    const [clip] = load("lunge-day6.joints.json");
    const r = analyzeClip("lunge", clip!.frames);
    expect(r.reps).toBe(15);
    expect(r.attempts.every((a) => a.counted && a.errors.length === 0)).toBe(true);
  });
});
