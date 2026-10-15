"use server";

import { z } from "zod";
import { ISO_ITEMS, isoItemsFor, susScore } from "@/lib/eval/survey";
import { requireUser } from "@/lib/supabase/auth";

const likert = z.number().int().min(1).max(5);
const schema = z.object({
  role: z.enum(["user", "it_expert"]),
  sus: z.array(likert).length(10),
  iso: z.record(z.string(), likert),
});
export type SurveyInput = z.input<typeof schema>;

/** PRD §12.5 / §12.6: save one participant's SUS and ISO/IEC 25010 answers. */
export async function submitSurvey(input: SurveyInput): Promise<{ ok: true; sus: number } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please answer every statement." };
  const { role, sus, iso } = parsed.data;
  const expected = isoItemsFor(role).map((i) => i.id);
  if (expected.some((id) => iso[id] == null)) return { ok: false, error: "Please answer every statement." };
  const known = new Set(ISO_ITEMS.map((i) => i.id));
  const isoAnswers = Object.fromEntries(Object.entries(iso).filter(([k]) => known.has(k) && expected.includes(k)));
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("survey_responses").insert([
    { user_id: user.id, kind: "sus", respondent_role: role, answers: sus },
    { user_id: user.id, kind: "iso25010", respondent_role: role, answers: isoAnswers },
  ]);
  if (error) return { ok: false, error: "Could not save your answers. Please try again." };
  return { ok: true, sus: susScore(sus)! };
}
