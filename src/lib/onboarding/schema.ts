import { z } from "zod";
import { PARQ_QUESTIONS } from "@/lib/agent/guardrails";

// Shared by the onboarding form (client) and its server actions (PRD ONB-01…06).

export const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "Mostly sitting", hint: "Desk work, little exercise" },
  { value: "light", label: "Lightly active", hint: "Light exercise 1–3 days a week" },
  { value: "moderate", label: "Moderately active", hint: "Exercise 3–5 days a week" },
  { value: "active", label: "Very active", hint: "Hard exercise 6–7 days a week" },
  { value: "very_active", label: "Extremely active", hint: "Physical job plus training" },
] as const;

export const GOAL_OPTIONS = [
  { value: "lose", label: "Lose weight", hint: "A safe, steady calorie deficit" },
  { value: "maintain", label: "Stay at my weight", hint: "Get fitter and stronger" },
  { value: "gain", label: "Gain weight", hint: "Build muscle with a small surplus" },
] as const;

export const EQUIPMENT_OPTIONS = [
  { value: "none", label: "No equipment" },
  { value: "mat", label: "Exercise mat" },
  { value: "dumbbells", label: "Dumbbells" },
] as const;

export const DIET_PATTERNS = [
  { value: "omnivore", label: "I eat everything" },
  { value: "pescatarian", label: "Fish, no meat" },
  { value: "vegetarian", label: "Vegetarian" },
] as const;

export const ALLERGENS = [
  { value: "peanut", label: "Peanuts" },
  { value: "shellfish", label: "Shellfish (hipon, alimango…)" },
  { value: "fish", label: "Fish" },
  { value: "egg", label: "Egg" },
  { value: "milk", label: "Milk" },
  { value: "soy", label: "Soy" },
  { value: "wheat", label: "Wheat / gluten" },
] as const;

const values = <T extends readonly { value: string }[]>(opts: T) =>
  opts.map((o) => o.value) as unknown as [T[number]["value"], ...T[number]["value"][]];

const parqShape = Object.fromEntries(PARQ_QUESTIONS.map((q) => [q.id, z.boolean()])) as Record<
  (typeof PARQ_QUESTIONS)[number]["id"],
  z.ZodBoolean
>;

export const screeningSchema = z.object({
  birthdate: z.iso.date({ message: "Enter your date of birth" }),
  sex: z.enum(["male", "female"], { message: "Choose one" }),
  pregnantOrBreastfeeding: z.boolean(),
  parq: z.object(parqShape),
  clearanceAck: z.boolean(),
});
export type ScreeningForm = z.infer<typeof screeningSchema>;

export const bodySchema = z
  .object({
    heightCm: z.number({ message: "Enter your height" }).min(100, "Between 100 and 250 cm").max(250, "Between 100 and 250 cm"),
    weightKg: z.number({ message: "Enter your weight" }).min(30, "Between 30 and 300 kg").max(300, "Between 30 and 300 kg"),
    targetWeightKg: z.number().min(30, "Between 30 and 300 kg").max(300, "Between 30 and 300 kg").nullable(),
  });
export type BodyForm = z.infer<typeof bodySchema>;

export const goalSchema = z.object({
  goal: z.enum(values(GOAL_OPTIONS), { message: "Choose a goal" }),
  activity: z.enum(values(ACTIVITY_OPTIONS), { message: "Choose your activity level" }),
});
export type GoalForm = z.infer<typeof goalSchema>;

export const trainingSchema = z.object({
  experience: z.enum(["beginner", "intermediate"], { message: "Choose one" }),
  equipment: z.array(z.enum(values(EQUIPMENT_OPTIONS))).min(1, "Pick at least one"),
  daysPerWeek: z.number().int().min(2).max(6),
  minutesPerSession: z.number().int().min(10).max(120),
});
export type TrainingForm = z.infer<typeof trainingSchema>;

export const dietSchema = z.object({
  pattern: z.enum(values(DIET_PATTERNS)),
  allergies: z.array(z.enum(values(ALLERGENS))),
  dislikes: z.array(z.string().trim().min(1).max(40)).max(20),
  budget: z.enum(["low", "mid"]),
  filipinoFirst: z.boolean(),
});
export type DietForm = z.infer<typeof dietSchema>;

export const ONBOARDING_STEPS = ["screening", "body", "goal", "training", "diet", "plan"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
