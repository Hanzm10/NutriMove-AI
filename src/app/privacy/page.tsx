import type { Metadata } from "next";
import { Logo } from "@/components/shell/logo";

export const metadata: Metadata = { title: "Privacy notice" };

// Draft privacy notice (PRD §8.3). Aaron (Compliance) owns the final wording.
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-nm-canvas px-5 py-8 sm:px-10">
      <header><Logo href="/" /></header>
      <main id="main" className="mx-auto mt-10 max-w-2xl space-y-5 text-nm-ink">
        <h1 className="text-[2.369rem] font-black">Privacy notice</h1>
        <p className="text-nm-muted">Draft — CS 403 school project, Technological Institute of the Philippines.</p>
        <Section title="What we collect">
          Account details (name, email), profile and body measurements, health screening answers,
          food, water and weight logs, workout results (rep counts, form-error counts, durations)
          and weekly check-ins.
        </Section>
        <Section title="What we don't collect">
          Camera video and photos are never uploaded or stored. Pose tracking runs on your device.
          In the optional laptop-coach mode, frames are streamed encrypted to the team&apos;s laptop,
          processed in memory, and discarded immediately.
        </Section>
        <Section title="Why">
          To calculate your targets, build your meal and workout plans, give form feedback, and
          adjust your plan each week.
        </Section>
        <Section title="Your rights (RA 10173)">
          You can access, export, correct and delete your data at any time from Profile → Privacy.
          Deleting your account permanently removes all of your records.
        </Section>
        <Section title="Not medical advice">
          NutriMove AI is not a medical device and does not diagnose, treat or cure any condition.
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-2 leading-relaxed text-nm-muted">{children}</p>
    </section>
  );
}
