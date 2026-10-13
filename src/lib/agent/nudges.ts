import type { Explanation } from "./types";

// AGENT-05: one rule-based nudge for the Overview card. Pure.

export type NudgeInput = {
  hour: number; // 0–23, Asia/Manila
  targets: { kcal: number; protein_g: number } | null;
  totals: { kcal: number; protein_g: number };
  workoutPlannedToday: boolean;
  workoutDoneToday: boolean;
  water: number;
  waterGoal: number;
};

export type Nudge = Explanation & {
  title: string;
  body: string;
  suggestion?: { name: string; detail: string };
  action?: { label: string; href: string };
};

/** Expected share of the day's intake by this hour (roughly linear 7:00 → 21:00). */
export function expectedShare(hour: number) {
  return Math.max(0, Math.min(1, (hour - 7) / 14));
}

export function dailyNudge(i: NudgeInput): Nudge {
  if (!i.targets) {
    return { title: "Let's set your targets", body: "Finish onboarding so I can coach your meals and workouts.", ruleIds: ["AGENT-05"], reasons: ["No targets yet"], action: { label: "Set up", href: "/onboarding" } };
  }
  const exp = expectedShare(i.hour);
  const proteinPace = i.totals.protein_g / Math.max(1, i.targets.protein_g);
  const kcalPace = i.totals.kcal / Math.max(1, i.targets.kcal);

  if (i.totals.kcal > i.targets.kcal * 1.1) {
    return {
      title: "A lighter rest of the day",
      body: "You're above today's calorie target. Choose vegetables, soups and lean protein for the rest of the day. One day won't undo your progress.",
      suggestion: { name: "Tinola (chicken & sayote soup)", detail: "Light, filling, high in protein" },
      ruleIds: ["AGENT-05", "NUDGE-OVER"], reasons: [`Eaten ${Math.round(kcalPace * 100)}% of target`],
    };
  }
  if (i.workoutPlannedToday && !i.workoutDoneToday && i.hour >= 15) {
    return {
      title: "Your session is waiting",
      body: "You still have today's workout planned. Even one or two exercises count.",
      action: { label: "Start workout", href: "/workout" },
      ruleIds: ["AGENT-05", "NUDGE-WORKOUT"], reasons: ["Planned session not logged by 3 pm"],
    };
  }
  if (exp >= 0.3 && proteinPace < exp * 0.7) {
    return {
      title: "A small adjustment for a stronger day",
      body: "Your protein intake is pacing below today's target. Add a protein-rich snack to support recovery and steady energy.",
      suggestion: { name: "Boiled egg + banana", detail: "About 180 kcal · 7 g protein" },
      action: { label: "Log a snack", href: "/nutrition" },
      ruleIds: ["AGENT-05", "NUDGE-PROTEIN"], reasons: [`Protein ${Math.round(proteinPace * 100)}% vs ~${Math.round(exp * 100)}% expected`],
    };
  }
  if (i.water < Math.round(i.waterGoal * exp) - 1) {
    return {
      title: "Time for a glass of water",
      body: `You've had ${i.water} of ${i.waterGoal} glasses. Keep a bottle nearby while you work.`,
      ruleIds: ["AGENT-05", "NUDGE-WATER"], reasons: ["Hydration behind pace"],
    };
  }
  return {
    title: "You're on track today",
    body: "Your meals and activity are pacing well. Keep it up.",
    ruleIds: ["AGENT-05", "NUDGE-OK"], reasons: ["All signals on pace"],
  };
}
