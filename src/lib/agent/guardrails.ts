import type { Explanation } from "./types";

/** PAR-Q+-style questions (ONB-01). A "yes" to any of them flags the user. */
export const PARQ_QUESTIONS = [
  { id: "heart_condition", text: "Has a doctor ever said you have a heart condition or high blood pressure?" },
  { id: "chest_pain", text: "Do you feel pain in your chest at rest, during daily activities, or when you exercise?" },
  { id: "dizziness", text: "Do you lose balance because of dizziness, or have you lost consciousness in the last 12 months?" },
  { id: "chronic_condition", text: "Have you been diagnosed with another chronic medical condition (other than heart disease or high blood pressure)?" },
  { id: "medication", text: "Are you currently taking prescribed medication for a chronic medical condition?" },
  { id: "bone_joint", text: "Do you have a bone, joint or soft-tissue problem that could get worse with more physical activity?" },
  { id: "supervised_only", text: "Has a doctor ever said you should only do medically supervised physical activity?" },
] as const;

export type ParqId = (typeof PARQ_QUESTIONS)[number]["id"];
export type ParqAnswers = Partial<Record<ParqId, boolean>>;

export const MIN_AGE = 18;

export type ScreeningInput = {
  ageYears: number;
  pregnantOrBreastfeeding: boolean;
  parq: ParqAnswers;
};

export type ScreeningResult = Explanation & {
  /** blocked: may not use the app. flagged: may continue with limits + clearance acknowledgement. */
  status: "ok" | "flagged" | "blocked";
  /** Forces maintenance calories (ONB-03). */
  maintenanceOnly: boolean;
  /** Caps workout level at beginner and low impact where relevant (ONB-03/04). */
  beginnerCap: boolean;
  lowImpactOnly: boolean;
  requiresClearanceAck: boolean;
};

export function screen(input: ScreeningInput): ScreeningResult {
  const ruleIds: string[] = [];
  const reasons: string[] = [];

  if (!Number.isFinite(input.ageYears) || input.ageYears < MIN_AGE) {
    return {
      status: "blocked",
      maintenanceOnly: false,
      beginnerCap: true,
      lowImpactOnly: true,
      requiresClearanceAck: false,
      ruleIds: ["ONB-02"],
      reasons: ["NutriMove AI is for adults 18 and over."],
    };
  }

  let maintenanceOnly = false;
  let beginnerCap = false;
  let lowImpactOnly = false;
  let requiresClearanceAck = false;

  if (input.pregnantOrBreastfeeding) {
    maintenanceOnly = true;
    beginnerCap = true;
    lowImpactOnly = true;
    ruleIds.push("ONB-03");
    reasons.push(
      "Because you're pregnant or breastfeeding, we won't set a calorie deficit and we'll keep workouts gentle. Please check your plan with your doctor or midwife.",
    );
  }

  const yes = PARQ_QUESTIONS.filter((q) => input.parq[q.id]);
  if (yes.length > 0) {
    beginnerCap = true;
    requiresClearanceAck = true;
    ruleIds.push("ONB-04");
    reasons.push(
      "One or more health answers suggest getting medical clearance before increasing activity. Your plan starts at beginner level.",
    );
  }

  const flagged = maintenanceOnly || requiresClearanceAck;
  return {
    status: flagged ? "flagged" : "ok",
    maintenanceOnly,
    beginnerCap,
    lowImpactOnly,
    requiresClearanceAck,
    ruleIds,
    reasons,
  };
}

/** Whole years between birthdate and `today` (both ISO dates or Date). */
export function ageFromBirthdate(birthdate: string | Date, today: Date = new Date()): number {
  const b = typeof birthdate === "string" ? new Date(`${birthdate}T00:00:00`) : birthdate;
  let age = today.getFullYear() - b.getFullYear();
  const beforeBirthday =
    today.getMonth() < b.getMonth() ||
    (today.getMonth() === b.getMonth() && today.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}
