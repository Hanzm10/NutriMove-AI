// Scoring clips against hand labels (PRD §12: rep accuracy ≥ 90 %, form-error F1 ≥ 0.75). Pure.
import type { ExerciseKind } from "../analyzers/types";
import type { Attempt } from "./replay";

/** Label words the team writes → the app's form-check codes. Anything else is "not checked by the app". */
export const LABEL_CODES: Record<ExerciseKind, Record<string, string>> = {
  squat: { "knees-in": "SQ_KNEE_VALGUS", shallow: "SQ_DEPTH", "lean-forward": "SQ_TORSO_LEAN" },
  pushup: { "hips-sag": "PU_HIP_SAG", "hips-pike": "PU_HIP_PIKE", "half-rep": "PU_DEPTH", shallow: "PU_DEPTH" },
  lunge: { shallow: "LU_DEPTH", "lean-forward": "LU_TORSO" },
};

export type RepLabel = { rep: number; labels: string[] };
export type ClipTruth = { exercise: ExerciseKind; reps: RepLabel[] };

const EXERCISE_ALIASES: Record<string, ExerciseKind> = { squat: "squat", pushup: "pushup", "push-up": "pushup", lunge: "lunge" };

/** `squat_knees-in_10.mp4` → { exercise, label: "knees-in", reps: 10 }. `mixed` means "see labels.csv". */
export function parseClipName(name: string): { exercise: ExerciseKind; label: string; reps: number } | null {
  const base = name.split(/[\\/]/).pop()!.replace(/\.joints\.json$|\.[a-z0-9]+$/i, "").toLowerCase();
  const m = /^(squat|pushup|push-up|lunge)_([a-z-]+?)(?:_(\d+))?$/.exec(base);
  if (!m) return null;
  return { exercise: EXERCISE_ALIASES[m[1]!]!, label: m[2]!, reps: m[3] ? Number(m[3]) : NaN };
}

/** labels.csv with columns `file,rep,errors` (errors: `good`, or names joined with `+`). Header optional. */
export function parseLabelsCsv(text: string): Map<string, RepLabel[]> {
  const out = new Map<string, RepLabel[]>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [file, rep, errors = ""] = line.split(",").map((s) => s.trim());
    const n = Number(rep);
    if (!file || !Number.isInteger(n) || n < 1) continue; // header or junk
    const key = clipKey(file);
    const labels = errors.toLowerCase().split("+").map((s) => s.trim()).filter((s) => s && s !== "good");
    const list = out.get(key) ?? [];
    list.push({ rep: n, labels });
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.rep - b.rep);
  return out;
}

/** Same key for `squat_mixed_12.mp4`, `squat_mixed_12.MOV` and `squat_mixed_12.joints.json`. */
export function clipKey(name: string) {
  return name.split(/[\\/]/).pop()!.replace(/\.joints\.json$|\.[a-z0-9]+$/i, "").toLowerCase();
}

/** Ground truth for a clip: from labels.csv when present, else from the file name (every rep has the named label). */
export function clipTruth(name: string, csv: Map<string, RepLabel[]>): ClipTruth | null {
  const parsed = parseClipName(name);
  if (!parsed) return null;
  const rows = csv.get(clipKey(name));
  if (rows?.length) return { exercise: parsed.exercise, reps: rows };
  if (!Number.isFinite(parsed.reps) || parsed.label === "mixed") return null;
  const labels = parsed.label === "good" ? [] : [parsed.label];
  return { exercise: parsed.exercise, reps: Array.from({ length: parsed.reps }, (_, i) => ({ rep: i + 1, labels })) };
}

export type ClassScore = { code: string; tp: number; fp: number; fn: number; precision: number; recall: number; f1: number };
export type ClipScore = { file: string; exercise: ExerciseKind; trueReps: number; appAttempts: number; appCounted: number; repAccuracy: number; unchecked: string[] };
export type Report = { clips: ClipScore[]; repAccuracy: number; classes: ClassScore[]; macroF1: number; unscored: string[] };

const ratio = (a: number, b: number) => (b ? a / b : 0);

/**
 * Rep accuracy per clip = 1 − |app attempts − true reps| / true reps (an attempt is a counted rep or a shallow rep the
 * app flagged; people count both). Form errors are matched rep by rep in order; extra or missing attempts count as
 * false positives / negatives. F1 per form-check code, micro-averaged over clips; macro F1 = mean over codes with support.
 */
export function scoreClips(clips: { file: string; attempts: Attempt[] }[], csv: Map<string, RepLabel[]>): Report {
  const counts = new Map<string, { tp: number; fp: number; fn: number }>();
  const bump = (code: string, k: "tp" | "fp" | "fn") => {
    const c = counts.get(code) ?? { tp: 0, fp: 0, fn: 0 };
    c[k]++;
    counts.set(code, c);
  };
  const scored: ClipScore[] = [];
  const unscored: string[] = [];
  for (const clip of clips) {
    const truth = clipTruth(clip.file, csv);
    if (!truth) {
      unscored.push(clip.file);
      continue;
    }
    const map = LABEL_CODES[truth.exercise];
    const codes = new Set(Object.values(map));
    const unchecked = new Set<string>();
    const n = Math.max(truth.reps.length, clip.attempts.length);
    for (let i = 0; i < n; i++) {
      const want = new Set<string>();
      for (const l of truth.reps[i]?.labels ?? []) {
        if (map[l]) want.add(map[l]!);
        else unchecked.add(l);
      }
      const got = new Set((clip.attempts[i]?.errors ?? []).filter((e) => codes.has(e)));
      for (const c of codes) {
        if (want.has(c) && got.has(c)) bump(c, "tp");
        else if (got.has(c)) bump(c, "fp");
        else if (want.has(c)) bump(c, "fn");
      }
    }
    const t = truth.reps.length;
    scored.push({
      file: clip.file,
      exercise: truth.exercise,
      trueReps: t,
      appAttempts: clip.attempts.length,
      appCounted: clip.attempts.filter((a) => a.counted).length,
      repAccuracy: t ? Math.max(0, 1 - Math.abs(clip.attempts.length - t) / t) : 0,
      unchecked: [...unchecked],
    });
  }
  const classes: ClassScore[] = [...counts.entries()]
    .map(([code, { tp, fp, fn }]) => {
      const precision = ratio(tp, tp + fp), recall = ratio(tp, tp + fn);
      return { code, tp, fp, fn, precision, recall, f1: ratio(2 * precision * recall, precision + recall) };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  const supported = classes.filter((c) => c.tp + c.fn > 0);
  return {
    clips: scored,
    repAccuracy: scored.length ? scored.reduce((s, c) => s + c.repAccuracy, 0) / scored.length : 0,
    classes,
    macroF1: supported.length ? supported.reduce((s, c) => s + c.f1, 0) / supported.length : 0,
    unscored,
  };
}
