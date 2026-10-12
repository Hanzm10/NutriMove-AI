import type { Metadata } from "next";
import { PoseSpike } from "./pose-spike";

export const metadata: Metadata = { title: "Pose spike", robots: { index: false } };

// Day-1 gate (PRD §7.7): can InstantHMR run in this browser, and how fast?
export default function PoseSpikePage() {
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Developer · Day-1 gate</p>
      <h1 className="mt-2 text-[2.369rem] font-black">InstantHMR in the browser</h1>
      <p className="mt-2 max-w-3xl text-nm-muted">
        Loads the released <code>instanthmr.onnx</code> (~81 MB, cached after the first load), runs it on your webcam
        or an image, and reports timings. No video leaves this device. Stand 2–3 m from the camera with your whole
        body in view. Tracking starts from a centred box and then follows your skeleton (no detector yet).
      </p>
      <PoseSpike />
    </main>
  );
}
