// How-to images for the exercise screen, each with its credit (shown on /credits; docs/datasets.md). Photos only where
// an openly licensed one (public domain, CC0, CC BY, CC BY-SA) shows our version of the move; every other exercise
// has an original illustration (scripts/draw-exercise-illustrations.mjs).

/** Licenses an exercise photo may have: no "non-commercial" or "no derivatives" terms. */
export const PHOTO_LICENSES = ["Original artwork (NutriMove AI)", "Unlicense (public domain)", "Public domain", "CC0 1.0", "CC BY 2.0", "CC BY 4.0", "CC BY-SA 3.0", "CC BY-SA 4.0"] as const;

export type PhotoCredit = {
  source: string;
  /** The photographer or uploader, when the source names one. */
  author?: string;
  license: (typeof PHOTO_LICENSES)[number];
  /** The page the image came from (where its license is stated). */
  url: string;
};

export type ExercisePhotos = {
  /** One caption per frame: two for a start/end pair, one for a single photo. */
  labels: readonly [string] | readonly [string, string];
  /** Where the photo differs from our steps (equipment, seated, …). */
  note?: string;
  credit: PhotoCredit;
  /** "svg" for our illustrations; photos are jpg. */
  ext?: "jpg" | "svg";
};

const START_END = ["Start", "Finish"] as const;

/** Our own drawings, made by scripts/draw-exercise-illustrations.mjs. */
const drawn = (labels: readonly [string, string]): ExercisePhotos => ({
  labels,
  ext: "svg",
  credit: {
    source: "NutriMove AI",
    license: "Original artwork (NutriMove AI)",
    url: "https://github.com/Hanzm10/NutriMove-AI/blob/main/scripts/draw-exercise-illustrations.mjs",
  },
});

/** Free Exercise DB: one folder of photos per exercise. */
const fedb = (id: string): PhotoCredit => ({
  source: "Free Exercise DB",
  license: "Unlicense (public domain)",
  url: `https://github.com/yuhonas/free-exercise-db/tree/main/exercises/${id}`,
});

export const EXERCISE_PHOTOS: Record<string, ExercisePhotos> = {
  pushup: { labels: ["Top", "Bottom"], credit: fedb("Pushups") },
  "decline-pushup": { labels: ["Top", "Bottom"], credit: fedb("Decline_Push-Up") },
  squat: { labels: ["Stand", "Squat"], credit: fedb("Bodyweight_Squat") },
  "jump-squat": { labels: ["Squat", "Jump"], credit: fedb("Freehand_Jump_Squat") },
  "split-squat": { labels: START_END, credit: fedb("Split_Squats") },
  "reverse-lunge": { labels: START_END, note: "Shown with dumbbells; the bodyweight version moves the same way.", credit: fedb("Dumbbell_Rear_Lunge") },
  "walking-lunge": { labels: START_END, credit: fedb("Bodyweight_Walking_Lunge") },
  "glute-bridge": { labels: ["Down", "Up"], credit: fedb("Butt_Lift_Bridge") },
  "single-leg-bridge": { labels: ["Down", "Up"], credit: fedb("Single_Leg_Glute_Bridge") },
  "step-up": { labels: START_END, note: "Shown with dumbbells; the bodyweight version moves the same way.", credit: fedb("Dumbbell_Step_Ups") },
  plank: { labels: ["Set up", "Hold"], credit: fedb("Plank") },
  "dead-bug": { labels: START_END, credit: fedb("Dead_Bug") },
  superman: { labels: ["Rest", "Lift"], credit: fedb("Superman") },
  "mountain-climber": { labels: ["One knee in", "Switch"], credit: fedb("Mountain_Climbers") },
  "db-goblet-squat": { labels: ["Stand", "Squat"], note: "Shown with a kettlebell; hold one dumbbell at your chest the same way.", credit: fedb("Goblet_Squat") },
  "db-row": { labels: ["Arms long", "Pull"], credit: fedb("Bent_Over_Two-Dumbbell_Row") },
  "db-shoulder-press": { labels: ["Shoulders", "Overhead"], note: "Shown seated; standing works the same.", credit: fedb("Dumbbell_Shoulder_Press") },
  "wall-pushup": drawn(["Arms straight", "Chest to wall"]),
  "knee-pushup": drawn(["Top", "Bottom"]),
  "box-squat": drawn(["Stand", "Sit back"]),
  "calf-raise": drawn(["Feet flat", "On your toes"]),
  "shoulder-tap": drawn(["High plank", "Tap"]),
  "bird-dog": drawn(["Hands and knees", "Reach"]),
  "step-jack": drawn(["Together", "Step out"]),
  "jumping-jack": drawn(["Together", "Feet wide"]),
  "march-in-place": drawn(["Knee up", "Switch"]),
  "high-knees": drawn(["Knee up", "Switch"]),
  "stretch-lower": drawn(["Hamstring", "Hip flexor"]),
  "stretch-upper": drawn(["Cross-body", "Triceps"]),
  "db-rdl": { labels: ["Stand", "Hinge"], note: "Shown with straighter legs; keep a soft bend in your knees.", credit: fedb("Stiff-Legged_Dumbbell_Deadlift") },
};

/** Image paths for an exercise (`/exercises/<slug>/<n>.jpg|svg`, one per label), or null when there is none. */
export function exercisePhotos(slug: string): (ExercisePhotos & { src: string[] }) | null {
  const p = EXERCISE_PHOTOS[slug];
  return p ? { ...p, src: p.labels.map((_, i) => `/exercises/${slug}/${i}.${p.ext ?? "jpg"}`) } : null;
}
