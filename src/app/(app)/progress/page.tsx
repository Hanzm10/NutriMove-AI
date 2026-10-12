import type { Metadata } from "next";
import { PlaceholderGrid } from "@/components/shell/placeholder-grid";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Progress" };

const SECTIONS = [
  { title: "Weight trend", body: "Feeds the weekly check-in rules (AGENT-03).", req: "DASH-02" },
  { title: "Activity & adherence", body: "Active minutes and days within your calorie target (DASH-02).", req: "DASH-02" },
  { title: "Good-form reps", body: "Share of reps without form errors, per exercise (POSE-14).", req: "POSE-14" },
];

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Your momentum" title="Progress" subtitle="Notice the patterns that are making healthy routines feel natural." />
      <PlaceholderGrid sections={SECTIONS} />
    </>
  );
}
