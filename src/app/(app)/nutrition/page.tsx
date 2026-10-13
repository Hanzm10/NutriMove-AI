import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { todayISO } from "@/lib/dates";
import { loadDay } from "@/lib/food/day";
import { requireUser } from "@/lib/supabase/auth";
import { NutritionDay } from "./nutrition-day";

export const metadata: Metadata = { title: "Nutrition" };

export default async function NutritionPage() {
  const { supabase, user } = await requireUser();
  const day = await loadDay(supabase, user.id, todayISO());
  return (
    <>
      <PageHeader eyebrow="Daily nourishment" title="Nutrition" subtitle="See how today's choices support your energy, training and recovery." />
      <NutritionDay day={day} />
    </>
  );
}
