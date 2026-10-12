import type { Metadata } from "next";
import { PlaceholderGrid } from "@/components/shell/placeholder-grid";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Overview" };

const SECTIONS = [
  { title: "Today’s workout", body: "Hero card: next session from your weekly plan (WORK-02).", req: "DASH-01" },
  { title: "Today’s targets", body: "Calories, protein, workout minutes and water vs your targets (FOOD-05, DASH-04).", req: "DASH-01" },
  { title: "AI coach insight", body: "A rule-based nudge from the agent, e.g. a protein snack suggestion (AGENT-05).", req: "AGENT-05" },
  { title: "This week", body: "Sessions done vs planned and your check-in status (AGENT-02).", req: "AGENT-02" },
];

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Today" title="Good morning" subtitle="Your plan, targets and today's workout will appear here." />
      <PlaceholderGrid sections={SECTIONS} />
    </>
  );
}
