import type { Metadata } from "next";
import { PlaceholderGrid } from "@/components/shell/placeholder-grid";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "AI Workout" };

const SECTIONS = [
  { title: "Today’s plan", body: "Session flow with sets, reps and timing (WORK-01/02).", req: "WORK-02" },
  { title: "Camera coach", body: "Live rep counting and form cues for squat, push-up and lunge (POSE-*).", req: "POSE-09" },
  { title: "Week plan", body: "Your weekly split and progressions (WORK-04).", req: "WORK-04" },
];

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Personalized movement" title="AI Workout" subtitle="A guided plan built around your goals, energy and experience." />
      <Link
        href="/workout/live"
        className="mt-8 inline-flex h-12 items-center rounded-xl bg-nm-primary px-6 font-bold text-nm-ink"
      >
        Try the live camera coach
      </Link>
      <PlaceholderGrid sections={SECTIONS} />
    </>
  );
}
