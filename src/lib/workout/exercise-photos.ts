// How-to photos for the exercise screen: start and end position, from Free Exercise DB (public domain, Unlicense;
// docs/datasets.md). Only where a photo shows our version of the move; the rest show steps only.

export type ExercisePhotos = {
  /** Captions for the two frames. */
  labels: readonly [string, string];
  /** Where the photo differs from our steps (equipment, seated, …). */
  note?: string;
};

const START_END = ["Start", "Finish"] as const;

export const EXERCISE_PHOTOS: Record<string, ExercisePhotos> = {
  pushup: { labels: ["Top", "Bottom"] },
  "decline-pushup": { labels: ["Top", "Bottom"] },
  squat: { labels: ["Stand", "Squat"] },
  "jump-squat": { labels: ["Squat", "Jump"] },
  "split-squat": { labels: START_END },
  "reverse-lunge": { labels: START_END, note: "Shown with dumbbells; the bodyweight version moves the same way." },
  "walking-lunge": { labels: START_END },
  "glute-bridge": { labels: ["Down", "Up"] },
  "single-leg-bridge": { labels: ["Down", "Up"] },
  "step-up": { labels: START_END, note: "Shown with dumbbells; the bodyweight version moves the same way." },
  plank: { labels: ["Set up", "Hold"] },
  "dead-bug": { labels: START_END },
  superman: { labels: ["Rest", "Lift"] },
  "mountain-climber": { labels: ["One knee in", "Switch"] },
  "db-goblet-squat": { labels: ["Stand", "Squat"], note: "Shown with a kettlebell; hold one dumbbell at your chest the same way." },
  "db-row": { labels: ["Arms long", "Pull"] },
  "db-shoulder-press": { labels: ["Shoulders", "Overhead"], note: "Shown seated; standing works the same." },
  "db-rdl": { labels: ["Stand", "Hinge"], note: "Shown with straighter legs; keep a soft bend in your knees." },
};

/** Photo paths for an exercise, or null when there is no photo. */
export function exercisePhotos(slug: string): (ExercisePhotos & { src: readonly [string, string] }) | null {
  const p = EXERCISE_PHOTOS[slug];
  return p ? { ...p, src: [`/exercises/${slug}/0.jpg`, `/exercises/${slug}/1.jpg`] } : null;
}
