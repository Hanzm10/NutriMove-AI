import { describe, expect, it } from "vitest";
import { formatBenchLine, summarizeBench, type BenchSample } from "./bench";

const run = (n: number, everyMs: number, ms: (i: number) => number, found = (i: number) => i % 10 !== 0): BenchSample[] =>
  Array.from({ length: n }, (_, i) => ({ t: i * everyMs, ms: ms(i), found: found(i), minVisibility: 0.8, yDown: true }));

describe("pose benchmark summary", () => {
  it("computes fps, latency percentiles, person-found share and the 3D check", () => {
    const r = summarizeBench("mediapipe-lite (gpu)", "iphone", 1234.4, run(301, 1000 / 30, (i) => (i < 200 ? 20 : 30)), 210e6);
    expect(r.fps).toBe(30);
    expect(r.p50Ms).toBe(20);
    expect(r.p95Ms).toBe(30);
    expect(r.foundPct).toBe(90);
    expect(r.visibility).toBe(0.8);
    expect(r.yDownPct).toBe(100);
    expect(r.memoryMB).toBe(210);
    expect(r.loadMs).toBe(1234);
  });

  it("handles an empty or single-frame run without dividing by zero", () => {
    expect(summarizeBench("x", "linux", 0, [])).toMatchObject({ frames: 0, fps: 0, p50Ms: null, foundPct: 0, yDownPct: null });
    expect(summarizeBench("x", "linux", 0, run(1, 33, () => 5)).fps).toBe(0);
  });

  it("formats one line per run for the team chat", () => {
    const r = summarizeBench("instanthmr-lite", "windows", 8000, run(31, 100, () => 95, () => true), null);
    expect(formatBenchLine(r)).toBe(
      "windows | instanthmr-lite | load 8.0 s | 10 fps | p50 95 ms | p95 95 ms | person 100% | vis 0.8 | 3D y-down 100% | mem –",
    );
  });
});
