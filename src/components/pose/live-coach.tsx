"use client";

import { Camera, CameraOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InstantHmrEstimator } from "@/lib/pose/instanthmr/estimator";
import { BoxTracker } from "@/lib/pose/tracker";
import { CANONICAL_EDGES, type CanonicalPose } from "@/lib/pose/types";

type Phase = "idle" | "loading" | "camera" | "running" | "error";
type Stats = { fps: number; inferenceMs: number; backend: string };

/**
 * Live camera + InstantHMR skeleton (POSE-01…04, 08). Frames stay on this device and are closed right after
 * inference. Exercise analyzers plug in via `onPose` (Day 3).
 */
export function LiveCoach({ onPose }: { onPose?: (pose: CanonicalPose) => void }) {
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
    try {
      setPhase("loading");
      const override = new URLSearchParams(location.search).get("model");
      const url = override?.startsWith("/") && !override.startsWith("//") ? override : undefined;
      estimatorRef.current ??= new InstantHmrEstimator(url);
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
            : `Could not start the coach: ${String(e)}`,
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
        if (visible) onPose?.(pose);
        fps = fps ? fps * 0.9 + (1000 / (now - last)) * 0.1 : 1000 / (now - last);
        last = now;
        if (++frames % 10 === 0) setStats({ fps, inferenceMs: s.inferenceMs, backend: s.backend });
      } catch (e) {
        if (runningRef.current) {
          setError(String(e));
          setPhase("error");
          stop();
        }
      }
    }
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
            <Camera aria-hidden /> Start camera coach
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
