import type { Metadata } from "next";
import { LiveCoach } from "@/components/pose/live-coach";

export const metadata: Metadata = { title: "Camera coach harness", robots: { index: false } };

// The live coach without login or a workout plan, for scripts/coach-soak.mjs (start/stop memory and process check).
export default function CoachHarnessPage() {
  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Developer · coach harness</p>
      <h1 className="mt-2 text-[2.369rem] font-black">Camera coach</h1>
      <p className="mt-2 max-w-3xl text-nm-muted">
        The camera coach on its own: no reps are saved. Add <code>?debug=1</code> for diagnostics.
      </p>
      <div className="mt-6">
        <LiveCoach />
      </div>
    </main>
  );
}
