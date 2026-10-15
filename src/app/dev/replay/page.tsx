import type { Metadata } from "next";
import { ClipReplay } from "./clip-replay";

export const metadata: Metadata = { title: "Clip replay", robots: { index: false } };

// PRD §12 / POSE-17: run recorded clips through the coach on this computer and score them against hand labels.
export default function ReplayPage() {
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Developer · evaluation</p>
      <h1 className="mt-2 text-[2.369rem] font-black">Clip replay and scoring</h1>
      <p className="mt-2 max-w-3xl text-nm-muted">
        Pick recorded clips and this page runs them through the same model and form checks as the live coach, on this
        computer. Videos never leave the device. You can download a <strong>joints-only</strong> file (body positions,
        no pictures) for tuning, and score the results against your <code>labels.csv</code>.
      </p>
      <ClipReplay />
    </main>
  );
}
