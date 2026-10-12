export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

/** Every agent decision carries the rules that fired and plain-language reasons (AGENT-01). */
export type Explanation = {
  ruleIds: string[];
  reasons: string[];
};
