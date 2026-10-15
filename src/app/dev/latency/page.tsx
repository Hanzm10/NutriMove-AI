import type { Metadata } from "next";
import { latencyReport } from "@/lib/pose/speed";
import { requireUser } from "@/lib/supabase/auth";
import { LatencyCsv } from "./latency-csv";

export const metadata: Metadata = { title: "Latency log", robots: { index: false } };

// PRD §12.3: speed of every saved camera session for the signed-in account (fps, p50 / p95 latency).
export default async function LatencyPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("workout_sessions")
    .select("started_at, pose_backend, device_class, avg_fps, p50_latency_ms, p95_latency_ms, exercises(slug)")
    .eq("user_id", user.id)
    .not("avg_fps", "is", null)
    .order("started_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []).map((r) => ({
    startedAt: r.started_at,
    exercise: (r.exercises as { slug: string } | null)?.slug ?? "",
    pose_backend: r.pose_backend,
    device_class: r.device_class,
    avg_fps: r.avg_fps == null ? null : Number(r.avg_fps),
    p50_latency_ms: r.p50_latency_ms == null ? null : Number(r.p50_latency_ms),
    p95_latency_ms: r.p95_latency_ms == null ? null : Number(r.p95_latency_ms),
  }));
  const groups = latencyReport(rows);
  const cell = (n: number | null, unit = "") => (n == null ? "—" : `${n}${unit}`);

  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Developer · evaluation</p>
      <h1 className="mt-2 text-[2.369rem] font-black">Latency log</h1>
      <p className="mt-2 max-w-3xl text-nm-muted">
        Speed of every camera session saved by this account. Latency is the time from capturing a frame to getting the
        joints back: the model alone on-device, the full round trip in laptop-coach mode. Targets (PRD §12.3): ≥ 15 fps
        and ≤ 100 ms on the laptop; ≥ 8 fps and ≤ 200 ms round trip on phones through the laptop.
      </p>

      {groups.length === 0 ? (
        <p className="mt-8 rounded-xl bg-nm-soft p-4">No sessions with speed data yet. Finish and save a camera session first.</p>
      ) : (
        <>
          <div className="mt-8 overflow-x-auto rounded-card border border-nm-line bg-white p-5">
            <table className="w-full text-left text-sm">
              <caption className="pb-3 text-left font-bold">By device and mode</caption>
              <thead>
                <tr className="border-b border-nm-line">
                  <th className="py-2 pr-3">Device</th><th className="py-2 pr-3">Mode</th><th className="py-2 pr-3">Sessions</th>
                  <th className="py-2 pr-3">Mean fps</th><th className="py-2 pr-3">Median p50</th><th className="py-2">Worst p95</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={`${g.device}-${g.mode}`} className="border-b border-nm-line/60">
                    <td className="py-2 pr-3">{g.device}</td><td className="py-2 pr-3">{g.mode}</td><td className="py-2 pr-3">{g.sessions}</td>
                    <td className="py-2 pr-3">{cell(g.meanFps)}</td><td className="py-2 pr-3">{cell(g.medianP50, " ms")}</td><td className="py-2">{cell(g.worstP95, " ms")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <LatencyCsv rows={rows} />
          </div>
        </>
      )}
    </main>
  );
}
