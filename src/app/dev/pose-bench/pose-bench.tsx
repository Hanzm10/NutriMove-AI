"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBenchLine, summarizeBench, type BenchResult, type BenchSample } from "@/lib/pose/bench";
import { InstantHmrEstimator } from "@/lib/pose/instanthmr/estimator";
import { DEFAULT_MODEL_URL, LITE_MODEL_URL } from "@/lib/pose/instanthmr/session";
import { worldIsYDown } from "@/lib/pose/mediapipe/adapter";
import { MediaPipePoseEstimator, type MediaPipeDelegate, type MediaPipeVariant } from "@/lib/pose/mediapipe/estimator";
import { deviceClass } from "@/lib/pose/speed";
import { BoxTracker } from "@/lib/pose/tracker";

type BackendId = `mediapipe-${MediaPipeVariant}-${"gpu" | "cpu"}` | "instanthmr-lite" | "instanthmr-full";
const BACKENDS: { id: BackendId; label: string }[] = [
  { id: "mediapipe-lite-gpu", label: "MediaPipe lite · GPU (5.8 MB)" },
  { id: "mediapipe-full-gpu", label: "MediaPipe full · GPU (9.4 MB)" },
  { id: "mediapipe-heavy-gpu", label: "MediaPipe heavy · GPU (31 MB, if fetched)" },
  { id: "mediapipe-lite-cpu", label: "MediaPipe lite · CPU" },
  { id: "instanthmr-lite", label: "InstantHMR lite · current app (52 MB)" },
  { id: "instanthmr-full", label: "InstantHMR full (81 MB)" },
];
const RUN_SECONDS = 20;

/** Best memory reading the browser offers: whole-page measurement (Chrome, cross-origin isolated) or the JS heap. */
async function memoryBytes(): Promise<number | null> {
  const perf = performance as Performance & {
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
    memory?: { usedJSHeapSize: number };
  };
  if (perf.measureUserAgentSpecificMemory && self.crossOriginIsolated) {
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000));
    const m = await Promise.race([perf.measureUserAgentSpecificMemory().then((x) => x.bytes).catch(() => null), timeout]);
    if (m != null) return m;
  }
  return perf.memory?.usedJSHeapSize ?? null;
}

export function PoseBench() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [backend, setBackend] = useState<BackendId>("mediapipe-lite-gpu");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchResult[]>([]);
  const [copied, setCopied] = useState(false);
  const stopRef = useRef(false);

  useEffect(
    () => () => {
      stopRef.current = true;
      (videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function camera() {
    const v = videoRef.current!;
    if (!v.srcObject) {
      v.srcObject = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false,
      });
      await v.play();
    }
    return v;
  }

  async function run() {
    setRunning(true);
    stopRef.current = false;
    let est: MediaPipePoseEstimator | InstantHmrEstimator | null = null;
    try {
      const v = await camera();
      const device = deviceClass(navigator.userAgent, navigator.maxTouchPoints);
      setStatus("Loading model…");
      const t0 = performance.now();
      if (backend.startsWith("mediapipe")) {
        const [, variant, del] = backend.split("-") as [string, MediaPipeVariant, "gpu" | "cpu"];
        est = new MediaPipePoseEstimator(variant, del.toUpperCase() as MediaPipeDelegate);
      } else {
        est = new InstantHmrEstimator(backend === "instanthmr-lite" ? LITE_MODEL_URL : DEFAULT_MODEL_URL, {
          prefer: backend === "instanthmr-lite" ? "wasm" : "webgpu",
        });
      }
      const loaded = await est.load();
      // InstantHMR reports only its execution provider ("wasm"/"webgpu"); name the model too.
      const label = est instanceof MediaPipePoseEstimator ? loaded.backend : `${backend} (${loaded.backend})`;
      const loadMs = performance.now() - t0;
      const samples: BenchSample[] = [];
      const tracker = new BoxTracker();
      const end = performance.now() + RUN_SECONDS * 1000;
      while (performance.now() < end && !stopRef.current) {
        await new Promise((r) => requestAnimationFrame(r));
        const w = v.videoWidth, h = v.videoHeight;
        const s0 = performance.now();
        if (est instanceof MediaPipePoseEstimator) {
          const r = est.estimate(v, w, h, [0, 0, w, h]);
          samples.push({
            t: s0, ms: performance.now() - s0, found: r.found,
            minVisibility: r.found ? r.minVisibility : undefined,
            yDown: r.found && r.raw3d ? worldIsYDown(r.raw3d) : null,
          });
        } else {
          const r = await est.estimate(v, w, h, tracker.current(w, h));
          const { tracking } = tracker.update(r.raw2d, w, h);
          samples.push({ t: s0, ms: performance.now() - s0, found: tracking });
        }
        if (samples.length % 15 === 0) setStatus(`Running ${label}… ${Math.ceil((end - performance.now()) / 1000)} s left`);
      }
      setStatus("Measuring memory…");
      const mem = await memoryBytes();
      setResults((rs) => [...rs, summarizeBench(label, device, loadMs, samples, mem)]);
      setStatus("Done. Pick another model, or copy the results.");
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      est?.dispose(); // one model in memory at a time
      setRunning(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(results.map(formatBenchLine).join("\n"));
    setCopied(true);
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid gap-4">
        <video ref={videoRef} playsInline muted className="w-full -scale-x-100 rounded-card bg-nm-ink-card" aria-label="Camera preview" />
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-bold">
            Model
            <select
              className="h-11 rounded-xl border border-nm-line bg-white px-3 text-base font-normal"
              value={backend}
              onChange={(e) => setBackend(e.target.value as BackendId)}
              disabled={running}
            >
              {BACKENDS.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </label>
          <Button onClick={run} disabled={running} className="h-11 rounded-xl font-bold">
            {running ? "Running…" : `Run ${RUN_SECONDS} s test`}
          </Button>
          {running && (
            <Button variant="outline" onClick={() => (stopRef.current = true)} className="h-11 rounded-xl">
              Stop early
            </Button>
          )}
        </div>
        <p role="status" className="text-sm text-nm-muted">{status}</p>
      </div>

      <div className="grid content-start gap-3">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-nm-muted uppercase">
              <tr>
                <th className="py-2 pr-3">Model</th><th className="pr-3">Load</th><th className="pr-3">FPS</th>
                <th className="pr-3">p50 / p95 ms</th><th className="pr-3">Person</th><th className="pr-3">3D ok</th><th>Memory</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-nm-line">
                  <td className="py-2 pr-3 font-bold">{r.backend}</td>
                  <td className="pr-3">{(r.loadMs / 1000).toFixed(1)} s</td>
                  <td className="pr-3">{r.fps}</td>
                  <td className="pr-3">{r.p50Ms ?? "–"} / {r.p95Ms ?? "–"}</td>
                  <td className="pr-3">{r.foundPct}%</td>
                  <td className="pr-3">{r.yDownPct == null ? "–" : `${r.yDownPct}%`}</td>
                  <td>{r.memoryMB == null ? "n/a" : `${r.memoryMB} MB`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {results.length > 0 && (
          <Button variant="outline" onClick={copy} className="h-11 w-fit rounded-xl">
            {copied ? "Copied" : "Copy results for the team"}
          </Button>
        )}
      </div>
    </div>
  );
}
