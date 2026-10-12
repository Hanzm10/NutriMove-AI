import type { Metadata } from "next";
import { PlaceholderGrid } from "@/components/shell/placeholder-grid";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Profile" };

const SECTIONS = [
  { title: "Profile & body stats", body: "Name, goal, experience, height, weight, diet and allergies (ONB-05/06).", req: "ONB-05" },
  { title: "Daily targets", body: 'Computed by the agent, with a "Why this number?" explanation (TGT-*).', req: "TGT-01" },
  { title: "Accessibility", body: "Larger text, high contrast, reduce motion, voice cues.", req: "§8.4" },
  { title: "Privacy", body: "Export or delete your data, consent history (AUTH-04/05).", req: "AUTH-04" },
];

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Personal setup" title="Profile & accessibility" subtitle="Shape NutriMove around your goals, routines and access needs." />
      <PlaceholderGrid sections={SECTIONS} />
    </>
  );
}
