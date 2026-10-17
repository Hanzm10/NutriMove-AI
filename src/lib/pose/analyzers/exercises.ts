import { angleAt, angleFromVertical, horizontalDist, mid, sub, verticalOffsetFromLine } from "../geometry";
import type { CanonicalPose } from "../types";
import { BaseAnalyzer } from "./base";
import defaultRules from "./exercise-rules.json";
import type { Cue, ExerciseAnalyzer, ExerciseKind } from "./types";
import { MedianWindow, shoulderTorsoRatio } from "./view";

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

/** Thresholds for every exercise (PRD Appendix C), tuned on labelled clips (POSE-17, docs/evaluation.md). */
export type ExerciseRules = typeof defaultRules;
export const DEFAULT_RULES: ExerciseRules = defaultRules;

/** The pose model producing the joints; each reads angles a little differently, so thresholds are per model. */
export type PoseModel = "instanthmr" | "mediapipe";

/** Default thresholds with the model's overrides applied (`backends` in exercise-rules.json). */
export function rulesFor(model: PoseModel): ExerciseRules {
  if (model === "instanthmr") return DEFAULT_RULES;
  const o = DEFAULT_RULES.backends[model] as Partial<Record<"squat" | "pushup" | "lunge", object>>;
  return {
    ...DEFAULT_RULES,
    squat: { ...DEFAULT_RULES.squat, ...o.squat },
    pushup: { ...DEFAULT_RULES.pushup, ...o.pushup },
    lunge: { ...DEFAULT_RULES.lunge, ...o.lunge },
  };
}

function squat(rules: ExerciseRules): ExerciseAnalyzer {
  const r = rules.squat;
  // Knee cave-in is judged two ways, picked by camera angle (Phase 2, docs/pose-optimization-plan.md):
  // - facing the camera: knees closer together than `valgusFrontMax` × ankle width at the bottom (clear for both models);
  // - side-on / 45°: against this person's own standing knee spacing (InstantHMR only; MediaPipe's 3D can't see it).
  let standingSpread: number | null = null;
  // ~10 s of standing frames: long enough that briefly turning toward the camera doesn't flip the knee rule.
  const view = new MedianWindow(150);
  return new BaseAnalyzer({
    kind: "squat",
    counter: { top: r.top, bottom: r.bottom, shallowFloor: r.shallowFloor },
    depthCode: "SQ_DEPTH",
    cues: pick(["SQ_DEPTH", "SQ_KNEE_VALGUS", "SQ_TORSO_LEAN"]),
    metrics: (p: CanonicalPose) => {
      const j = p.joints3d;
      if (!j) return null;
      const angle = (angleAt(j.l_hip, j.l_knee, j.l_ankle) + angleAt(j.r_hip, j.r_knee, j.r_ankle)) / 2;
      const ankles = horizontalDist(j.l_ankle, j.r_ankle);
      const spread = ankles > 1e-3 ? horizontalDist(j.l_knee, j.r_knee) / ankles : null;
      if (angle > r.top) {
        if (spread != null) standingSpread = standingSpread == null ? spread : standingSpread * 0.9 + spread * 0.1;
        const v = shoulderTorsoRatio(p);
        if (v != null) view.push(v);
      }
      const violations: string[] = [];
      if (angle < r.shallowFloor) {
        const facing = (view.median ?? 0) >= r.frontViewMin;
        if (spread != null) {
          const caved = facing
            ? spread < r.valgusFrontMax
            : r.valgusSide && standingSpread != null && spread < r.valgusDrop * standingSpread;
          if (caved) violations.push("SQ_KNEE_VALGUS");
        }
        const torso = sub(mid(j.l_shoulder, j.r_shoulder), mid(j.l_hip, j.r_hip));
        if (angleFromVertical(torso) > r.torsoLeanMax) violations.push("SQ_TORSO_LEAN");
      }
      return { angle, violations };
    },
  }, rules.common);
}

function pushup(rules: ExerciseRules): ExerciseAnalyzer {
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
  }, rules.common);
}

function lunge(rules: ExerciseRules): ExerciseAnalyzer {
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
  }, rules.common);
}

export function createAnalyzer(kind: ExerciseKind, rules: ExerciseRules = DEFAULT_RULES): ExerciseAnalyzer {
  return kind === "squat" ? squat(rules) : kind === "pushup" ? pushup(rules) : lunge(rules);
}

export const EXERCISE_SETUP: Record<ExerciseKind, { label: string; camera: string; tip: string }> = {
  squat: {
    label: "Bodyweight squat",
    camera: "Face the camera (best for the knee check), or turn 45°",
    tip: "Feet shoulder-width apart, whole body in view.",
  },
  pushup: {
    label: "Push-up",
    camera: "Side view, phone turned sideways, at floor height",
    tip: "Turn the phone sideways so your whole body fits across the screen. Hands under shoulders, body in a straight line.",
  },
  lunge: { label: "Lunge", camera: "Side view", tip: "Step forward, lower until both knees bend." },
};
