import { buildAnalyzer, type ExerciseRules, type ParamValue } from "./engine";
import defaultRules from "./exercise-rules.json";
import type { Cue, ExerciseAnalyzer, ExerciseKind } from "./types";

export type { ExerciseRules } from "./engine";

// PRD Appendix C. Messages are spoken aloud, so keep them short and positive.
export const CUES: Record<string, Cue> = {
  SQ_DEPTH: { code: "SQ_DEPTH", message: "Go a little deeper", severity: "depth" },
  SQ_KNEE_VALGUS: { code: "SQ_KNEE_VALGUS", message: "Push your knees out", severity: "safety" },
  SQ_TORSO_LEAN: { code: "SQ_TORSO_LEAN", message: "Keep your chest up", severity: "posture" },
  PU_DEPTH: { code: "PU_DEPTH", message: "Lower your chest more", severity: "depth" },
  PU_HIP_SAG: { code: "PU_HIP_SAG", message: "Tighten your core, hips are sagging", severity: "safety" },
  PU_HIP_PIKE: { code: "PU_HIP_PIKE", message: "Lower your hips", severity: "posture" },
  PU_FLOOR: { code: "PU_FLOOR", message: "Get down on the floor for push-ups", severity: "posture" },
  LU_DEPTH: { code: "LU_DEPTH", message: "Drop your back knee lower", severity: "depth" },
  LU_TORSO: { code: "LU_TORSO", message: "Stay upright", severity: "posture" },
};

/** Thresholds and form checks for every exercise (PRD Appendix C), tuned on labelled clips (POSE-17, docs/evaluation.md). */
export const DEFAULT_RULES: ExerciseRules = defaultRules;

/** The pose model producing the joints; each reads angles a little differently, so thresholds are per model. */
export type PoseModel = "instanthmr" | "mediapipe";

/** Default rules with the model's param overrides applied (`backends` in exercise-rules.json). */
export function rulesFor(model: PoseModel): ExerciseRules {
  if (model === "instanthmr") return DEFAULT_RULES;
  const o = (DEFAULT_RULES.backends as Record<string, Partial<Record<ExerciseKind, Record<string, ParamValue>>>>)[model] ?? {};
  const merged = (k: ExerciseKind) => ({ ...DEFAULT_RULES[k], params: { ...DEFAULT_RULES[k].params, ...o[k] } });
  return { ...DEFAULT_RULES, squat: merged("squat"), pushup: merged("pushup"), lunge: merged("lunge") };
}

export function createAnalyzer(kind: ExerciseKind, rules: ExerciseRules = DEFAULT_RULES): ExerciseAnalyzer {
  return buildAnalyzer(kind, rules[kind], rules.common, CUES);
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
