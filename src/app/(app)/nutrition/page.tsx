import type { Metadata } from "next";
import { PlaceholderGrid } from "@/components/shell/placeholder-grid";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Nutrition" };

const SECTIONS = [
  { title: "Daily energy", body: "kcal eaten vs target and macro balance (FOOD-05).", req: "FOOD-05" },
  { title: "Today’s meals", body: "Log from search, barcode, or your plan (FOOD-01…09).", req: "FOOD-04" },
  { title: "Meal plan", body: "7-day Filipino-first plan with swaps (MEAL-01…04).", req: "MEAL-01" },
  { title: "Hydration", body: "Glasses of water today (DASH-04).", req: "DASH-04" },
];

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Daily nourishment" title="Nutrition" subtitle="See how today's choices support your energy, training and recovery." />
      <PlaceholderGrid sections={SECTIONS} />
    </>
  );
}
