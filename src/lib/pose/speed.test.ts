import { describe, expect, it } from "vitest";
import { deviceClass, latencyReport, percentile, summarizeSpeed } from "./speed";

describe("speed summary", () => {
  it("nearest-rank percentiles", () => {
    const xs = [50, 10, 40, 20, 30];
    expect(percentile(xs, 50)).toBe(30);
    expect(percentile(xs, 95)).toBe(50);
    expect(percentile(xs, 0)).toBe(10);
    expect(percentile([], 50)).toBeNull();
    expect(percentile([NaN, 7], 50)).toBe(7);
  });

  it("summarizes a session", () => {
    expect(summarizeSpeed([12, 13, 14], [55, 60, 65, 200])).toEqual({ avgFps: 13, p50LatencyMs: 60, p95LatencyMs: 200 });
    expect(summarizeSpeed([], [])).toEqual({ avgFps: null, p50LatencyMs: null, p95LatencyMs: null });
  });

  it("classifies devices coarsely", () => {
    expect(deviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)")).toBe("iphone");
    expect(deviceClass("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ipad");
    expect(deviceClass("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("mac");
    expect(deviceClass("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(deviceClass("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(deviceClass("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    expect(deviceClass("curl/8")).toBe("other");
  });
});

describe("latency report", () => {
  it("groups sessions by device and mode", () => {
    const rows = [
      { device_class: "iphone", pose_backend: "remote", avg_fps: 12, p50_latency_ms: 60, p95_latency_ms: 90 },
      { device_class: "iphone", pose_backend: "remote", avg_fps: 14, p50_latency_ms: 58, p95_latency_ms: 120 },
      { device_class: "windows", pose_backend: "instanthmr", avg_fps: 20, p50_latency_ms: 40, p95_latency_ms: 55 },
      { device_class: null, pose_backend: "instanthmr", avg_fps: null, p50_latency_ms: null, p95_latency_ms: null },
    ];
    expect(latencyReport(rows)).toEqual([
      { device: "iphone", mode: "laptop coach", sessions: 2, meanFps: 13, medianP50: 58, worstP95: 120 },
      { device: "unknown", mode: "on device", sessions: 1, meanFps: null, medianP50: null, worstP95: null },
      { device: "windows", mode: "on device", sessions: 1, meanFps: 20, medianP50: 40, worstP95: 55 },
    ]);
  });
});
