import type { Metadata } from "next";
import { PoseBench } from "./pose-bench";

export const metadata: Metadata = { title: "Pose model benchmark", robots: { index: false } };

// Phase 0 of docs/pose-optimization-plan.md: MediaPipe Pose Landmarker vs InstantHMR on this device.
export default function PoseBenchPage() {
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Developer · Phase 0 benchmark</p>
      <h1 className="mt-2 text-[2.369rem] font-black">Pose model benchmark</h1>
      <p className="mt-2 max-w-3xl text-nm-muted">
        Runs each model on your camera for 20 seconds through the same code the coach uses, and reports speed, how often
        it found you, and memory. One model is loaded at a time. Stand 2–3 m back with your whole body in view and do a
        few squats. Nothing leaves this device. Run every model, then tap <strong>Copy results</strong> and paste them in
        the group chat.
      </p>
      <PoseBench />
    </main>
  );
}
