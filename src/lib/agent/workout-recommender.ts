import type { Explanation, Goal } from "./types";
import { cosine } from "./vectors";

// PRD §7.6 (WORK-01). Pure: catalogue + profile in, weekly plan out.

export type CatalogExercise = {
  slug: string;
  name: string;
  muscle_groups: string[];
  equipment: string[];
  difficulty: number;
  impact: "low" | "high" | string;
  pose_supported: boolean;
  contraindications: string[];
};

export type WorkoutProfile = {
  goal: Goal;
  experience: "beginner" | "intermediate";
  equipment: string[];
  daysPerWeek: number;
  minutesPerSession: number;
  beginnerCap?: boolean;
  lowImpactOnly?: boolean;
  /** e.g. ["knee"] from screening or a reported injury. */
  avoid?: string[];
  /** AGENT-03: cumulative set change from weekly check-ins (−2…+2). */
  setAdjust?: number;
};

export type PlanItem = { slug: string; sets: number; reps: number; timed: boolean; restS: number; score: number };
export type PlanDay = { dayOffset: number; focus: string; items: PlanItem[]; estMinutes: number };
export type WorkoutPlan = Explanation & { split: string; days: PlanDay[] };

/** Exercises measured in seconds rather than reps. */
const TIMED: Record<string, number> = {
  plank: 30, superman: 20, "mountain-climber": 30, "step-jack": 40, "jumping-jack": 30,
  "march-in-place": 45, "high-knees": 30, "stretch-lower": 180, "stretch-upper": 120,
};

type Slot = { name: string; groups: string[]; prefer?: string[] };

const SLOTS = {
  squat: { name: "Squat pattern", groups: ["quads", "glutes"], prefer: ["squat"] },
  push: { name: "Push", groups: ["chest", "triceps"], prefer: ["pushup"] },
  hinge: { name: "Hinge / glutes", groups: ["glutes", "hamstrings"] },
  lunge: { name: "Single leg", groups: ["quads", "glutes"], prefer: ["reverse-lunge", "split-squat", "step-up"] },
  pull: { name: "Back", groups: ["back"] },
  core: { name: "Core", groups: ["core"] },
  shoulders: { name: "Shoulders", groups: ["shoulders"] },
  calves: { name: "Calves", groups: ["calves"] },
  cardio: { name: "Conditioning", groups: ["cardio"] },
  cooldown: { name: "Cool-down", groups: ["mobility"] },
} satisfies Record<string, Slot>;

const DAY_OFFSETS: Record<number, number[]> = {
  2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5],
};

const GOAL_EMPHASIS: Record<Goal, Record<string, number>> = {
  lose: { cardio: 1, quads: 0.8, glutes: 0.8, core: 0.7, hamstrings: 0.6, chest: 0.5, back: 0.5, shoulders: 0.4 },
  maintain: { quads: 0.7, glutes: 0.7, chest: 0.7, back: 0.7, core: 0.7, shoulders: 0.6, hamstrings: 0.6, cardio: 0.5 },
  gain: { chest: 1, back: 1, quads: 1, glutes: 0.9, shoulders: 0.8, hamstrings: 0.8, triceps: 0.6, biceps: 0.6, core: 0.5 },
};

function sessionTemplates(days: number, goal: Goal): { split: string; sessions: { focus: string; slots: Slot[] }[] } {
  const finisher = goal === "lose" ? [SLOTS.cardio] : [];
  const fullA = { focus: "Full body A", slots: [SLOTS.squat, SLOTS.push, SLOTS.hinge, SLOTS.core, ...finisher, SLOTS.cooldown] };
  const fullB = { focus: "Full body B", slots: [SLOTS.lunge, SLOTS.push, SLOTS.pull, SLOTS.squat, SLOTS.core, ...finisher, SLOTS.cooldown] };
  const lower = { focus: "Lower body", slots: [SLOTS.squat, SLOTS.lunge, SLOTS.hinge, SLOTS.calves, ...finisher, SLOTS.cooldown] };
  const upper = { focus: "Upper body", slots: [SLOTS.push, SLOTS.pull, SLOTS.shoulders, SLOTS.core, SLOTS.cooldown] };
  const cond = { focus: "Conditioning + core", slots: [SLOTS.cardio, SLOTS.squat, SLOTS.core, SLOTS.cardio, SLOTS.cooldown] };
  if (days <= 3) return { split: "full_body", sessions: Array.from({ length: days }, (_, i) => (i % 2 ? fullB : fullA)) };
  if (days === 4) return { split: "upper_lower", sessions: [lower, upper, lower, upper] };
  return { split: "full_body_conditioning", sessions: Array.from({ length: days }, (_, i) => [fullA, cond, fullB][i % 3]!) };
}

function exerciseVector(e: CatalogExercise): Record<string, number> {
  return Object.fromEntries(e.muscle_groups.map((g) => [g, 1]));
}

export function eligible(e: CatalogExercise, p: WorkoutProfile): boolean {
  const owned = new Set(["none", ...p.equipment]);
  if (!e.equipment.some((x) => owned.has(x))) return false;
  const maxDifficulty = p.beginnerCap || p.experience === "beginner" ? 1 : 2;
  if (e.difficulty > maxDifficulty) return false;
  if ((p.lowImpactOnly || p.beginnerCap) && e.impact === "high") return false;
  if (p.avoid?.some((a) => e.contraindications.includes(a))) return false;
  return true;
}

/** WORK-01: weekly plan. `rotation` varies picks between sessions so the week isn't repetitive. */
export function recommendWorkoutPlan(p: WorkoutProfile, catalog: CatalogExercise[]): WorkoutPlan {
  const ruleIds = ["WORK-01"];
  const reasons: string[] = [];
  const pool = catalog.filter((e) => eligible(e, p));
  const user = GOAL_EMPHASIS[p.goal];
  const days = Math.min(6, Math.max(2, p.daysPerWeek));
  const { split, sessions } = sessionTemplates(days, p.goal);
  const intermediate = p.experience === "intermediate" && !p.beginnerCap;
  const adjust = Math.max(-2, Math.min(2, Math.round(p.setAdjust ?? 0)));
  const sets = Math.max(1, Math.min(5, (intermediate ? 3 : 2) + adjust));
  const reps = intermediate ? 12 : 10;
  const restS = intermediate ? 75 : 60;

  if (p.beginnerCap) {
    ruleIds.push("ONB-04");
    reasons.push("Your plan uses beginner-level, low-impact moves because of your health answers.");
  }
  if (p.lowImpactOnly) reasons.push("High-impact moves (jumping) are left out.");
  if (adjust !== 0) {
    ruleIds.push(adjust > 0 ? "AGT-WORKOUT-PROGRESS" : "AGT-WORKOUT-REGRESS");
    reasons.push(adjust > 0 ? `Your check-ins showed workouts felt easy, so sets go up by ${adjust}.` : `Your check-ins showed workouts felt hard or painful, so sets go down by ${-adjust}.`);
  }
  reasons.push(
    `${days} sessions a week as a ${split.replaceAll("_", " ")} split, ${sets} sets of about ${reps} reps with ${restS} s rest.`,
  );
  if (p.goal === "lose") reasons.push("Each session ends with a short conditioning block to raise your daily activity.");

  const usedBySession: string[][] = [];
  const planDays: PlanDay[] = sessions.map((s, si) => {
    const used = new Set<string>();
    const items: PlanItem[] = [];
    for (const slot of s.slots) {
      const candidates = pool
        // Match on the primary (first-listed) muscle group, so a goblet squat never fills a core slot.
        .filter((e) => !used.has(e.slug) && fillsSlot(e, slot))
        .map((e) => {
          let score = cosine(user, exerciseVector(e)) + 0.5 * cosine(Object.fromEntries(slot.groups.map((g) => [g, 1])), exerciseVector(e));
          if ("prefer" in slot && slot.prefer?.includes(e.slug)) score += 1; // camera-coached moves first
          if (e.pose_supported) score += 0.2;
          // Load what the user owns, and match the training level.
          if (e.equipment.some((x) => x !== "none" && x !== "mat" && p.equipment.includes(x))) score += 0.3;
          if (intermediate && e.difficulty === 2) score += 0.2;
          if (usedBySession[si - 1]?.includes(e.slug) && !e.pose_supported) score -= 0.3; // variety day to day
          return { e, score };
        })
        .sort((a, b) => b.score - a.score || a.e.slug.localeCompare(b.e.slug));
      const pick = candidates[0];
      if (!pick) continue;
      used.add(pick.e.slug);
      const timed = pick.e.slug in TIMED;
      const isCooldown = slot === SLOTS.cooldown;
      items.push({
        slug: pick.e.slug,
        sets: isCooldown ? 1 : slot === SLOTS.cardio ? 2 : sets,
        reps: timed ? TIMED[pick.e.slug]! : reps,
        timed,
        restS: isCooldown ? 0 : restS,
        score: Math.round(pick.score * 1000) / 1000,
      });
    }
    // Fit the session into the user's time: drop finisher/core blocks first if it runs long.
    const trimmed = fitToMinutes(items, p.minutesPerSession);
    usedBySession[si] = trimmed.map((i) => i.slug);
    return { dayOffset: DAY_OFFSETS[days]![si]!, focus: s.focus, items: trimmed, estMinutes: estimateMinutes(trimmed) };
  });

  if (planDays.some((d) => d.items.some((i) => catalog.find((e) => e.slug === i.slug)?.pose_supported))) {
    reasons.push("Moves marked with the camera icon can be coached live with rep counting and form cues.");
  }
  return { split, days: planDays, ruleIds, reasons };
}

function fillsSlot(e: CatalogExercise, slot: Slot) {
  if (slot === SLOTS.cardio) return e.muscle_groups.includes("cardio");
  return slot.groups.includes(e.muscle_groups[0] ?? "");
}

export function estimateMinutes(items: PlanItem[]): number {
  const secs = items.reduce((acc, i) => acc + i.sets * ((i.timed ? i.reps : i.reps * 3) + i.restS) + 30, 0);
  return Math.round(secs / 60);
}

function fitToMinutes(items: PlanItem[], minutes: number): PlanItem[] {
  const out = [...items];
  // Never drop the first two strength moves or the cool-down.
  while (estimateMinutes(out) > minutes && out.length > 3) {
    const idx = out.length - 2; // the slot just before the cool-down
    if (idx < 2) break;
    out.splice(idx, 1);
  }
  return out;
}
