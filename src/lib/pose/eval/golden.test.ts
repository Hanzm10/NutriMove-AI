// Phase 4 gate (docs/pose-optimization-plan.md): the exercise engine must give the same decisions on every team clip as
// the analyzers it replaced. Regenerate on purpose with `UPDATE_GOLDEN=1 pnpm vitest run golden` and review the diff.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAnalyzer, rulesFor, type PoseModel } from "../analyzers/exercises";
import { analyzeClip, type ClipJoints } from "./replay";

const clipsDir = new URL("../../../../eval/clips/", import.meta.url);
const goldenUrl = new URL("analyzer-golden.json", clipsDir);

/** Fixture files and the pose model that produced them. */
const FIXTURES: [file: string, model: PoseModel][] = [
  ["squat-day6.joints.json", "instanthmr"],
  ["lunge-day6.joints.json", "instanthmr"],
  ["pushup-day6.joints.json", "instanthmr"],
  ["mediapipe-squat-side.joints.json", "mediapipe"],
  ["mediapipe-squat-front.joints.json", "mediapipe"],
];

// EC3D isn't committed (no stated licence), so its golden file lives next to it, untracked. See ec3d.test.ts.
const ec3dDir = new URL("../../../../eval/ec3d/", import.meta.url);
const ec3dPresent = existsSync(new URL("ec3d.joints.json", ec3dDir));

function decisions(dir: URL, fixtures: [string, PoseModel][]) {
  const out: Record<string, string[]> = {};
  for (const [file, model] of fixtures) {
    const json = JSON.parse(readFileSync(new URL(file, dir), "utf8")) as { clips?: ClipJoints[] } & ClipJoints;
    for (const c of json.clips ?? [json]) {
      const { attempts } = analyzeClip(c.exercise, c.frames, (k) => createAnalyzer(k, rulesFor(model)));
      // One line per attempt keeps the golden file diffable.
      out[`${model}/${c.file}`] = attempts.map((a) => `${a.tMs} ${a.counted ? "rep" : "partial"} ${a.errors.join(",")}`.trim());
    }
  }
  return out;
}

function matchGolden(now: Record<string, string[]>, golden: URL) {
  if (process.env.UPDATE_GOLDEN || !existsSync(golden)) writeFileSync(golden, JSON.stringify(now, null, 1) + "\n");
  expect(now).toEqual(JSON.parse(readFileSync(golden, "utf8")));
}

describe("exercise engine golden decisions", () => {
  it("matches the recorded decisions on every team clip", () => {
    matchGolden(decisions(clipsDir, FIXTURES), goldenUrl);
  });

  it.skipIf(!ec3dPresent)("matches the recorded decisions on the EC3D clips", () => {
    matchGolden(decisions(ec3dDir, [["ec3d.joints.json", "instanthmr"]]), new URL("analyzer-golden.json", ec3dDir));
  });
});
