import { angleAt, angleFromVertical, horizontalDist, mid, sub, verticalOffsetFromLine } from "../geometry";
import type { CanonicalPose } from "../types";
import { BaseAnalyzer } from "./base";
import rules from "./exercise-rules.json";
import type { Cue, ExerciseAnalyzer, ExerciseKind } from "./types";

// PRD Appendix C. Messages are spoken aloud, so keep them short and positive.
export const CUES: Record<string, Cue> = {
  SQ_DEPTH: { code: "SQ_DEPTH", message: "Go a little deeper", severity: "depth" },
  SQ_KNEE_VALGUS: { code: "SQ_KNEE_VALGUS", message: "Push your knees out", severity: "safety" },
  SQ_TORSO_LEAN: { code: "SQ_TORSO_LEAN", message: "Keep your chest up", severity: "posture" },
  PU_DEPTH: { code: "PU_DEPTH", message: "Lower your chest more", severity: "depth" },
  PU_HIP_SAG: { code: "PU_HIP_SAG", message: "Tighten your core, hips are sagging", severity: "safety" },
  PU_HIP_PIKE: { code: "PU_HIP_PIKE", message: "Lower your hips", severity: "posture" },
  LU_DEPTH: { code: "LU_DEPTH", message: "Drop your back knee lower", severity: "depth" },
  LU_TORSO: { code: "LU_TORSO", message: "Stay upright", severity: "posture" },
};

const pick = (codes: string[]) => Object.fromEntries(codes.map((c) => [c, CUES[c]!]));

function squat(): ExerciseAnalyzer {
  const r = rules.squat;
  return new BaseAnalyzer({
    kind: "squat",
    counter: { top: r.top, bottom: r.bottom, shallowFloor: r.shallowFloor },
    depthCode: "SQ_DEPTH",
    cues: pick(["SQ_DEPTH", "SQ_KNEE_VALGUS", "SQ_TORSO_LEAN"]),
    metrics: (p: CanonicalPose) => {
      const j = p.joints3d;
      if (!j) return null;
      const angle = (angleAt(j.l_hip, j.l_knee, j.l_ankle) + angleAt(j.r_hip, j.r_knee, j.r_ankle)) / 2;
      const violations: string[] = [];
      if (angle < r.shallowFloor) {
        if (horizontalDist(j.l_knee, j.r_knee) < r.valgusRatio * horizontalDist(j.l_ankle, j.r_ankle)) violations.push("SQ_KNEE_VALGUS");
        const torso = sub(mid(j.l_shoulder, j.r_shoulder), mid(j.l_hip, j.r_hip));
        if (angleFromVertical(torso) > r.torsoLeanMax) violations.push("SQ_TORSO_LEAN");
      }
      return { angle, violations };
    },
  });
}

function pushup(): ExerciseAnalyzer {
  const r = rules.pushup;
  return new BaseAnalyzer({
    kind: "pushup",
    counter: { top: r.top, bottom: r.bottom, shallowFloor: r.shallowFloor },
    depthCode: "PU_DEPTH",
    cues: pick(["PU_DEPTH", "PU_HIP_SAG", "PU_HIP_PIKE"]),
    metrics: (p: CanonicalPose) => {
      const j = p.joints3d;
      if (!j) return null;
      const angle = (angleAt(j.l_shoulder, j.l_elbow, j.l_wrist) + angleAt(j.r_shoulder, j.r_elbow, j.r_wrist)) / 2;
      const shoulder = mid(j.l_shoulder, j.r_shoulder), hip = mid(j.l_hip, j.r_hip), ankle = mid(j.l_ankle, j.r_ankle);
      const violations: string[] = [];
      const offset = verticalOffsetFromLine(hip, shoulder, ankle);
      if (angleAt(shoulder, hip, ankle) < r.bodyLineMin && Math.abs(offset) > r.hipOffsetM) {
        violations.push(offset > 0 ? "PU_HIP_SAG" : "PU_HIP_PIKE");
      }
      return { angle, violations };
    },
  });
}

function lunge(): ExerciseAnalyzer {
  const r = rules.lunge;
  return new BaseAnalyzer({
    kind: "lunge",
    counter: { top: r.top, bottom: r.bottom, shallowFloor: r.shallowFloor },
    depthCode: "LU_DEPTH",
    cues: pick(["LU_DEPTH", "LU_TORSO"]),
    metrics: (p: CanonicalPose) => {
      const j = p.joints3d;
      if (!j) return null;
      // Front leg = the more bent knee.
      const angle = Math.min(angleAt(j.l_hip, j.l_knee, j.l_ankle), angleAt(j.r_hip, j.r_knee, j.r_ankle));
      const violations: string[] = [];
      if (angle < r.shallowFloor) {
        const torso = sub(mid(j.l_shoulder, j.r_shoulder), mid(j.l_hip, j.r_hip));
        if (angleFromVertical(torso) > r.torsoLeanMax) violations.push("LU_TORSO");
      }
      return { angle, violations };
    },
  });
}

export function createAnalyzer(kind: ExerciseKind): ExerciseAnalyzer {
  return kind === "squat" ? squat() : kind === "pushup" ? pushup() : lunge();
}

export const EXERCISE_SETUP: Record<ExerciseKind, { label: string; camera: string; tip: string }> = {
  squat: { label: "Bodyweight squat", camera: "Face the camera, or turn 45°", tip: "Feet shoulder-width apart, whole body in view." },
  pushup: { label: "Push-up", camera: "Side view, camera at floor height", tip: "Hands under shoulders, body in a straight line." },
  lunge: { label: "Lunge", camera: "Side view", tip: "Step forward, lower until both knees bend." },
};
