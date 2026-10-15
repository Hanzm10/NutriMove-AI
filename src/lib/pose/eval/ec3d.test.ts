// Held-out check on the public EC3D dataset (4 people the thresholds were never tuned on). The converted clips are
// not committed (no stated licence): run `python3 scripts/ec3d-to-clips.py data_3D.pickle` first. See docs/evaluation.md.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeClip, type ClipJoints } from "./replay";
import { parseLabelsCsv, scoreClips } from "./score";

const dir = new URL("../../../../eval/ec3d/", import.meta.url);
const present = existsSync(new URL("ec3d.joints.json", dir));

describe.skipIf(!present)("EC3D held-out clips", () => {
  it("scores squats and lunges against EC3D's labels", () => {
    const { clips } = JSON.parse(readFileSync(new URL("ec3d.joints.json", dir), "utf8")) as { clips: ClipJoints[] };
    const labels = parseLabelsCsv(readFileSync(new URL("ec3d.labels.csv", dir), "utf8"));
    for (const exercise of ["squat", "lunge"] as const) {
      const set = clips.filter((c) => c.exercise === exercise);
      const report = scoreClips(set.map((c) => ({ file: c.file, attempts: analyzeClip(exercise, c.frames).attempts })), labels);
      console.log(`\nEC3D ${exercise}`);
      console.table(report.clips.map((c) => ({ file: c.file, reps: c.trueReps, attempts: c.appAttempts, counted: c.appCounted, acc: c.repAccuracy.toFixed(3) })));
      console.table(report.classes.map((c) => ({ code: c.code, tp: c.tp, fp: c.fp, fn: c.fn, P: c.precision.toFixed(2), R: c.recall.toFixed(2), F1: c.f1.toFixed(2) })));
      console.log(`rep accuracy ${(report.repAccuracy * 100).toFixed(1)} %, macro F1 ${report.macroF1.toFixed(2)}`);
      expect(report.unscored).toEqual([]);
      expect(report.repAccuracy).toBeGreaterThanOrEqual(0.9); // PRD §12 rep-count target
    }
  });
});
