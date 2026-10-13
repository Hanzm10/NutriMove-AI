"use client";

import { Camera, CameraOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { pushupPose, repTrajectory, squatPose } from "@/lib/pose/analyzers/synthetic";
import { InstantHmrEstimator } from "@/lib/pose/instanthmr/estimator";
import { BoxTracker } from "@/lib/pose/tracker";
import { CANONICAL_EDGES, type CanonicalPose } from "@/lib/pose/types";

type Phase = "idle" | "loading" | "camera" | "running" | "error";
export type Stats = { fps: number; inferenceMs: number; backend: string };

/**
 * Live camera + InstantHMR skeleton (POSE-01…04, 08). Frames stay on this device and are closed right after
 * inference. Exercise analyzers plug in via `onPose` (Day 3).
 */
export function LiveCoach({
  onPose,
  onStats,
  hud,
  startLabel = "Start camera coach",
}: {
  onPose?: (pose: CanonicalPose) => void;
  onStats?: (s: Stats) => void;
  /** Overlay drawn on top of the video while running (rep counter, cues…). */
  hud?: React.ReactNode;
  startLabel?: string;
}) {
  // Keep the latest callbacks without restarting the camera loop.
  const onPoseRef = useRef(onPose);
  const onStatsRef = useRef(onStats);
  useEffect(() => {
    onPoseRef.current = onPose;
    onStatsRef.current = onStats;
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const estimatorRef = useRef<InstantHmrEstimator | null>(null);
  const runningRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inFrame, setInFrame] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  // Debug overlay (?debug=1) only renders once stats exist, i.e. after the camera starts on the client.
  const [debug] = useState(() => typeof location !== "undefined" && new URLSearchParams(location.search).has("debug"));

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setError(null);
    const synthetic = new URLSearchParams(location.search).get("synthetic");
    if (synthetic) return startSynthetic(synthetic);
    try {
      setPhase("loading");
      const override = new URLSearchParams(location.search).get("model");
      const url = override?.startsWith("/") && !override.startsWith("//") ? override : undefined;
      // ?ep=wasm skips WebGPU (diagnostics on devices where WebGPU misbehaves).
      const ep = new URLSearchParams(location.search).get("ep") === "wasm" ? "wasm" : "webgpu";
      estimatorRef.current ??= new InstantHmrEstimator(url, ep);
      await estimatorRef.current.load((l, t) =>
        setProgress(t ? `Loading coach model… ${Math.round((l / t) * 100)}%` : `Loading coach model… ${(l / 1e6).toFixed(0)} MB`),
      );
      setPhase("camera");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false,
      });
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setPhase("running");
      runningRef.current = true;
      void loop();
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access in your browser settings and try again."
          : name === "NotFoundError"
            ? "No camera was found on this device."
            : `Could not start the coach: ${e instanceof Error ? e.message : String(e)}`,
      );
      setPhase("error");
      stopCamera();
    }
  }

  async function loop() {
    const v = videoRef.current!;
    const canvas = canvasRef.current!;
    const estimator = estimatorRef.current!;
    const tracker = new BoxTracker();
    let lastSeen = performance.now();
    let fps = 0;
    let last = performance.now();
    let frames = 0;
    while (runningRef.current) {
      if (v.readyState < 2) {
        await new Promise((r) => requestAnimationFrame(r));
        continue;
      }
      const w = v.videoWidth, h = v.videoHeight;
      try {
        const bitmap = await createImageBitmap(v);
        const { pose, stats: s, raw2d } = await estimator.estimate(bitmap, tracker.current(w, h));
        const { tracking } = tracker.update(raw2d, w, h);
        const now = performance.now();
        if (tracking) lastSeen = now;
        const visible = now - lastSeen < 1000;
        setInFrame((prev) => (prev === visible ? prev : visible));
        draw(canvas, w, h, pose, visible);
        if (visible) onPoseRef.current?.(pose);
        fps = fps ? fps * 0.9 + (1000 / (now - last)) * 0.1 : 1000 / (now - last);
        last = now;
        if (++frames % 10 === 0) {
          const st = { fps, inferenceMs: s.inferenceMs, backend: s.backend };
          setStats(st);
          onStatsRef.current?.(st);
        }
      } catch (e) {
        if (runningRef.current) {
          setError(String(e));
          setPhase("error");
          stop();
        }
      }
    }
  }

  /**
   * Test mode (?synthetic=squat|pushup|lunge): no camera or model. Generates stick-figure reps at 30 fps
   * (every 3rd rep with a form fault) to exercise the analyzer → HUD → cues → summary path end to end.
   */
  function startSynthetic(kind: string) {
    setPhase("running");
    runningRef.current = true;
    const canvas = canvasRef.current!;
    const frames: CanonicalPose[] = [];
    let t = performance.now();
    for (let rep = 0; rep < 200; rep++) {
      const fault = rep % 3 === 2;
      for (const a of repTrajectory(175, 85, 2000)) {
        t += 1000 / 30;
        frames.push(
          kind === "pushup" ? pushupPose(a, t, { hipDrop: fault ? 0.2 : 0 })
          : kind === "lunge" ? squatPose(175, t, { leftKnee: a })
          : squatPose(a, t, a < 120 && fault ? { valgus: true } : {}),
        );
      }
      for (let i = 0; i < 12; i++) frames.push(kind === "pushup" ? pushupPose(170, (t += 1000 / 30)) : squatPose(175, (t += 1000 / 30)));
    }
    const t0 = performance.now() - frames[0]!.timestamp;
    let i = 0;
    const tick = () => {
      if (!runningRef.current || i >= frames.length) return;
      const f = frames[i++]!;
      const pose = { ...f, timestamp: f.timestamp + t0 };
      draw(canvas, 640, 480, pose, true);
      onPoseRef.current?.(pose);
      if (i % 10 === 0) setStats({ fps: 30, inferenceMs: 0, backend: "synthetic" });
      setTimeout(tick, 1000 / 30);
    };
    tick();
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function stop() {
    runningRef.current = false;
    stopCamera();
    if (phase === "running") setPhase("idle");
  }

  return (
    <div className="grid gap-5">
      <div className="relative overflow-hidden rounded-card bg-nm-ink-card">
        <video ref={videoRef} playsInline muted className="block aspect-video w-full -scale-x-100 object-cover" aria-hidden />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" aria-hidden />
        {phase !== "running" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
            {phase === "loading" || phase === "camera" ? (
              <p className="flex items-center gap-2 font-bold">
                <Loader2 className="size-5 animate-spin" aria-hidden /> {phase === "camera" ? "Starting camera…" : progress || "Loading coach model…"}
              </p>
            ) : (
              <div className="max-w-sm">
                <Camera className="mx-auto size-10 text-nm-accent" aria-hidden />
                <p className="mt-3 text-lg font-bold">Stand 2–3 m from your camera, whole body in view.</p>
                <p className="mt-1 text-sm text-white/80">Video is processed on this device and never uploaded.</p>
              </div>
            )}
          </div>
        )}
        {phase === "running" && hud}
        {phase === "running" && !inFrame && (
          <p className="absolute inset-x-4 top-4 rounded-xl bg-white/95 p-3 text-center font-bold text-nm-ink">
            Step into frame so I can see your whole body
          </p>
        )}
        {debug && stats && (
          <p className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-2 py-1 font-mono text-xs text-white">
            {stats.backend} · {stats.fps.toFixed(1)} fps · infer {stats.inferenceMs.toFixed(0)} ms ·{" "}
            {String(globalThis.crossOriginIsolated)}
          </p>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {phase === "running" ? (inFrame ? "Tracking your movement." : "Step into frame.") : ""}
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-nm-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {phase === "running" ? (
          <Button variant="outline" className="h-12 rounded-xl bg-white px-6 font-bold" onClick={stop}>
            <CameraOff aria-hidden /> Stop camera
          </Button>
        ) : (
          <Button className="h-12 rounded-xl px-6 text-base font-bold" onClick={start} disabled={phase === "loading" || phase === "camera"}>
            <Camera aria-hidden /> {startLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

function draw(canvas: HTMLCanvasElement, w: number, h: number, pose: CanonicalPose, visible: boolean) {
  if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  if (!visible) return;
  const lw = Math.max(3, w / 220);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#9bd141";
  ctx.lineWidth = lw;
  for (const [a, b] of CANONICAL_EDGES) {
    const p = pose.joints2d[a], q = pose.joints2d[b];
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  for (const p of Object.values(pose.joints2d)) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], lw, 0, Math.PI * 2);
    ctx.fill();
  }
}
