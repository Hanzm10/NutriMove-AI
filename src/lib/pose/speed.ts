// Session speed summary for the latency log (PRD §12.3). Pure.

/** Nearest-rank percentile (p in 0–100) of the samples; null when there are none. */
export function percentile(samples: readonly number[], p: number): number | null {
  const xs = samples.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!xs.length) return null;
  const rank = Math.ceil((p / 100) * xs.length);
  return xs[Math.min(xs.length, Math.max(1, rank)) - 1]!;
}

export type DeviceClass = "iphone" | "ipad" | "android" | "windows" | "mac" | "linux" | "other";

/** Coarse device class from the user agent: enough to group the latency report, nothing identifying. */
export function deviceClass(ua: string, maxTouchPoints = 0): DeviceClass {
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return "ipad";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Linux|CrOS/.test(ua)) return "linux";
  return "other";
}

const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

/** What a coached session stores: mean fps and p50/p95 of per-frame latency (round trip in laptop mode). */
export function summarizeSpeed(fps: readonly number[], latencyMs: readonly number[]) {
  const f = fps.filter(Number.isFinite);
  return {
    avgFps: f.length ? r1(f.reduce((a, b) => a + b, 0) / f.length) : null,
    p50LatencyMs: r1(percentile(latencyMs, 50)),
    p95LatencyMs: r1(percentile(latencyMs, 95)),
  };
}

export type SpeedRow = { device_class: string | null; pose_backend: string | null; avg_fps: number | null; p50_latency_ms: number | null; p95_latency_ms: number | null };
export type SpeedGroup = { device: string; mode: string; sessions: number; meanFps: number | null; medianP50: number | null; worstP95: number | null };

/** PRD §12.3 table: sessions grouped by device class and pose mode. */
export function latencyReport(rows: readonly SpeedRow[]): SpeedGroup[] {
  const groups = new Map<string, SpeedRow[]>();
  for (const r of rows) {
    const key = `${r.device_class ?? "unknown"}|${r.pose_backend === "remote" ? "laptop coach" : r.pose_backend === "instanthmr" ? "on device" : (r.pose_backend ?? "unknown")}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, rs]) => {
      const [device, mode] = key.split("|") as [string, string];
      const fps = rs.map((r) => r.avg_fps).filter((x): x is number => x != null).map(Number);
      const p50 = rs.map((r) => r.p50_latency_ms).filter((x): x is number => x != null).map(Number);
      const p95 = rs.map((r) => r.p95_latency_ms).filter((x): x is number => x != null).map(Number);
      return {
        device,
        mode,
        sessions: rs.length,
        meanFps: fps.length ? r1(fps.reduce((a, b) => a + b, 0) / fps.length) : null,
        medianP50: r1(percentile(p50, 50)),
        worstP95: p95.length ? Math.max(...p95) : null,
      };
    })
    .sort((a, b) => a.device.localeCompare(b.device) || a.mode.localeCompare(b.mode));
}
