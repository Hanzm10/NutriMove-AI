// Phase 0 pose-model benchmark summary (docs/pose-optimization-plan.md). Pure: samples in, numbers out.
import { percentile } from "./speed";

export type BenchSample = { t: number; ms: number; found: boolean; minVisibility?: number; yDown?: boolean | null };

export type BenchResult = {
  backend: string;
  device: string;
  loadMs: number;
  frames: number;
  /** Frames analysed per second over the run. */
  fps: number;
  /** Model time per frame (main-thread call for MediaPipe; worker round trip for InstantHMR). */
  p50Ms: number | null;
  p95Ms: number | null;
  /** Share of frames where a person was found. */
  foundPct: number;
  /** Median lowest-joint visibility when found (MediaPipe only). */
  visibility: number | null;
  /** MediaPipe 3D check: share of found frames where ankles are below shoulders (should be ~100 % when standing). */
  yDownPct: number | null;
  memoryMB: number | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeBench(
  backend: string,
  device: string,
  loadMs: number,
  samples: readonly BenchSample[],
  memoryBytes: number | null = null,
): BenchResult {
  const found = samples.filter((s) => s.found);
  const span = samples.length > 1 ? (samples.at(-1)!.t - samples[0]!.t) / 1000 : 0;
  const ms = samples.map((s) => s.ms);
  const vis = found.map((s) => s.minVisibility).filter((v): v is number => v != null);
  const checked = found.filter((s) => s.yDown != null);
  const p50 = percentile(ms, 50), p95 = percentile(ms, 95), v50 = percentile(vis, 50);
  return {
    backend,
    device,
    loadMs: Math.round(loadMs),
    frames: samples.length,
    fps: span > 0 ? r1((samples.length - 1) / span) : 0,
    p50Ms: p50 == null ? null : r1(p50),
    p95Ms: p95 == null ? null : r1(p95),
    foundPct: samples.length ? Math.round((found.length / samples.length) * 100) : 0,
    visibility: v50 == null ? null : Math.round(v50 * 100) / 100,
    yDownPct: checked.length ? Math.round((checked.filter((s) => s.yDown).length / checked.length) * 100) : null,
    memoryMB: memoryBytes == null ? null : Math.round(memoryBytes / 1e6),
  };
}

/** One line per run, for pasting into the team chat / docs/pose-optimization-plan.md. */
export function formatBenchLine(r: BenchResult): string {
  const v = (x: number | null, unit = "") => (x == null ? "–" : `${x}${unit}`);
  return [
    r.device, r.backend, `load ${(r.loadMs / 1000).toFixed(1)} s`, `${r.fps} fps`,
    `p50 ${v(r.p50Ms, " ms")}`, `p95 ${v(r.p95Ms, " ms")}`, `person ${r.foundPct}%`,
    `vis ${v(r.visibility)}`, `3D y-down ${v(r.yDownPct, "%")}`, `mem ${v(r.memoryMB, " MB")}`,
  ].join(" | ");
}
