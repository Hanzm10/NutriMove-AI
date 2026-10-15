// PRD §12.5 (ISO/IEC 25010) and §12.6 (System Usability Scale): questions and scoring. Pure.

/** Brooke's 10 SUS items (1 = strongly disagree … 5 = strongly agree), "system" → "NutriMove". */
export const SUS_ITEMS = [
  "I think that I would like to use NutriMove frequently.",
  "I found NutriMove unnecessarily complex.",
  "I thought NutriMove was easy to use.",
  "I think that I would need the support of a technical person to be able to use NutriMove.",
  "I found the various functions in NutriMove were well integrated.",
  "I thought there was too much inconsistency in NutriMove.",
  "I would imagine that most people would learn to use NutriMove very quickly.",
  "I found NutriMove very cumbersome to use.",
  "I felt very confident using NutriMove.",
  "I needed to learn a lot of things before I could get going with NutriMove.",
] as const;

/** SUS score 0–100: odd items contribute (a − 1), even items (5 − a), sum × 2.5. Null unless all 10 are 1–5. */
export function susScore(answers: readonly number[]): number | null {
  if (answers.length !== 10 || answers.some((a) => !Number.isInteger(a) || a < 1 || a > 5)) return null;
  const sum = answers.reduce((s, a, i) => s + (i % 2 === 0 ? a - 1 : 5 - a), 0);
  return sum * 2.5;
}

/** Bangor, Kortum & Miller (2009) adjective scale; 68 is the commonly cited average. */
export function susAdjective(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 72) return "Good";
  if (score >= 52) return "OK";
  if (score >= 38) return "Poor";
  return "Awful";
}

export type Role = "user" | "it_expert";
export type IsoCharacteristic =
  | "Functional suitability" | "Performance efficiency" | "Compatibility" | "Interaction capability (usability)"
  | "Reliability" | "Security" | "Maintainability";

/** ISO/IEC 25010 statements (1 = strongly disagree … 5 = strongly agree). `roles` = who answers the item. */
export const ISO_ITEMS: { id: string; characteristic: IsoCharacteristic; text: string; roles: Role[] }[] = [
  { id: "fs1", characteristic: "Functional suitability", text: "The app computes calorie and macro targets that fit my profile.", roles: ["user", "it_expert"] },
  { id: "fs2", characteristic: "Functional suitability", text: "Food logging, meal plans and workout plans do what I expect.", roles: ["user", "it_expert"] },
  { id: "fs3", characteristic: "Functional suitability", text: "The camera coach counts my reps and gives useful form cues.", roles: ["user", "it_expert"] },
  { id: "pe1", characteristic: "Performance efficiency", text: "Pages and searches respond quickly.", roles: ["user", "it_expert"] },
  { id: "pe2", characteristic: "Performance efficiency", text: "The camera coach keeps up with my movement without noticeable lag.", roles: ["user", "it_expert"] },
  { id: "co1", characteristic: "Compatibility", text: "The app works on my phone and on a laptop browser.", roles: ["user", "it_expert"] },
  { id: "co2", characteristic: "Compatibility", text: "The app works well alongside its external services (USDA, Open Food Facts, the laptop pose server).", roles: ["it_expert"] },
  { id: "us1", characteristic: "Interaction capability (usability)", text: "It is easy to learn how to use the app.", roles: ["user", "it_expert"] },
  { id: "us2", characteristic: "Interaction capability (usability)", text: "Screens, buttons and messages are clear and consistent.", roles: ["user", "it_expert"] },
  { id: "us3", characteristic: "Interaction capability (usability)", text: "The app is usable with a keyboard, a screen reader and larger text.", roles: ["user", "it_expert"] },
  { id: "re1", characteristic: "Reliability", text: "The app works without errors or crashes.", roles: ["user", "it_expert"] },
  { id: "re2", characteristic: "Reliability", text: "When something fails, the app explains what happened and how to recover.", roles: ["user", "it_expert"] },
  { id: "se1", characteristic: "Security", text: "I trust the app to keep my health data private (only I can see it).", roles: ["user", "it_expert"] },
  { id: "se2", characteristic: "Security", text: "Access control, secrets handling and data protection follow good practice.", roles: ["it_expert"] },
  { id: "ma1", characteristic: "Maintainability", text: "The code is modular, readable and covered by automated tests.", roles: ["it_expert"] },
  { id: "ma2", characteristic: "Maintainability", text: "Rules and thresholds can be changed without rewriting the app.", roles: ["it_expert"] },
];

export const isoItemsFor = (role: Role) => ISO_ITEMS.filter((i) => i.roles.includes(role));

/** Common 5-point Likert interpretation (weighted mean ranges of width 0.8). */
export function likertInterpretation(mean: number): string {
  if (mean >= 4.21) return "Strongly agree (very high quality)";
  if (mean >= 3.41) return "Agree (high quality)";
  if (mean >= 2.61) return "Neutral (moderate quality)";
  if (mean >= 1.81) return "Disagree (low quality)";
  return "Strongly disagree (very low quality)";
}

export type IsoRow = { characteristic: IsoCharacteristic; n: number; mean: number; interpretation: string };

/** Weighted mean per characteristic over every response's answers ({ itemId: 1–5 }). */
export function isoSummary(responses: readonly Record<string, number>[]): IsoRow[] {
  const sums = new Map<IsoCharacteristic, { total: number; n: number }>();
  for (const r of responses) {
    for (const item of ISO_ITEMS) {
      const a = r[item.id];
      if (!Number.isInteger(a) || a! < 1 || a! > 5) continue;
      const s = sums.get(item.characteristic) ?? { total: 0, n: 0 };
      s.total += a!;
      s.n += 1;
      sums.set(item.characteristic, s);
    }
  }
  return [...new Set(ISO_ITEMS.map((i) => i.characteristic))]
    .filter((c) => sums.has(c))
    .map((c) => {
      const { total, n } = sums.get(c)!;
      const mean = Math.round((total / n) * 100) / 100;
      return { characteristic: c, n, mean, interpretation: likertInterpretation(mean) };
    });
}
