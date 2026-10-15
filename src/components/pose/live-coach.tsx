"use client";

import { Camera, CameraOff, Gauge, Laptop, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { pushupPose, repTrajectory, squatPose } from "@/lib/pose/analyzers/synthetic";
import { InstantHmrEstimator } from "@/lib/pose/instanthmr/estimator";
import { createLoadGuard, defaultRung, parseLoadParams, type LoadGuard, type Rung } from "@/lib/pose/instanthmr/load-guard";
import { DEFAULT_MODEL_URL, LITE_MODEL_URL, isIOS } from "@/lib/pose/instanthmr/session";
import { RemotePoseEstimator } from "@/lib/pose/remote/estimator";
import { PAIRING_KEY, loadPairing, pairingFromRaw } from "@/lib/pose/remote/protocol";
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
  const frameRef = useRef<HTMLDivElement>(null);
  // The camera box takes the camera's own shape (portrait on phones) so nothing is cropped and the skeleton lines up.
  const [aspect, setAspect] = useState(16 / 9);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const estimatorRef = useRef<InstantHmrEstimator | RemotePoseEstimator | null>(null);
  const runningRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inFrame, setInFrame] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  // ?debug=1 shows the diagnostics panel (device, setup, step-by-step log) from the first tap, not just once running.
  const debug = useSyncExternalStore(
    () => () => {},
    () => parseLoadParams(location.search).debug,
    () => false,
  );
  // The speed readout (fps, round trip) can also be switched on with a button: typing ?debug=1 on a phone is fiddly.
  const statsOn = useSyncExternalStore(
    subscribeStatsPref,
    () => safeStorage().getItem(STATS_KEY) === "1",
    () => false,
  );
  const showStats = debug || statsOn;
  const guardRef = useRef<LoadGuard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [previousLog, setPreviousLog] = useState<string[]>([]);
  const [rungLabel, setRungLabel] = useState("");
  const [exhausted, setExhausted] = useState(false);
  // A paired laptop (PRD §7.7.3) replaces the on-device model, e.g. on phones that can't run it.
  const pairedRaw = useSyncExternalStore(
    () => () => {},
    () => (parseLoadParams(location.search).pose === "device" ? null : safeStorage().getItem(PAIRING_KEY)),
    () => null,
  );
  const paired = useMemo(() => pairingFromRaw(pairedRaw), [pairedRaw]);
  const getGuard = () => (guardRef.current ??= createLoadGuard(safeStorage()));

  useEffect(() => {
    // Leaving the page normally is not a crash; a killed page never fires pagehide.
    const leave = () => guardRef.current?.cleanExit();
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
      stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setError(null);
    const synthetic = new URLSearchParams(location.search).get("synthetic");
    if (synthetic) return startSynthetic(synthetic);
    try {
      setPhase("loading");
      const params = parseLoadParams(location.search);
      const guard = getGuard();
      const pairing = params.pose === "device" ? null : loadPairing(safeStorage());
      let ready = false;
      let lastError = "";
      if (pairing) {
        // Laptop coach: no model runs on this device, so there is nothing for the crash ladder to guard.
        setRungLabel("laptop coach");
        const est = new RemotePoseEstimator(pairing);
        estimatorRef.current = est;
        setProgress("Connecting to your laptop…");
        try {
          await est.load();
          setLines(["laptop coach connected"]);
          ready = true;
        } catch (e) {
          est.dispose();
          estimatorRef.current = null;
          throw e;
        }
      } else {
      const begin = guard.begin(defaultRung(isIOS()), params.rung);
      setPreviousLog(begin.previousLog);
      if (begin.crashed) {
        setNotice(
          `The browser closed this page last time while it was "${begin.crashed.stage}", usually because the phone ran low on memory. ` +
            (begin.rung ? `Trying a lighter setup: ${begin.rung.label}.` : ""),
        );
      }
      let rung: Rung | null = begin.rung;
      while (rung && !ready) {
        setRungLabel(rung.label);
        const model = params.model ?? rung.model;
        const url = model === "lite" ? LITE_MODEL_URL : model === "full" ? DEFAULT_MODEL_URL : model;
        guard.stage("starting worker");
        setLines([...guard.lines()]);
        const est = new InstantHmrEstimator(url, {
          prefer: params.ep ?? rung.prefer,
          threads: params.threads ?? rung.threads,
        });
        estimatorRef.current = est;
        try {
          await est.load(
            (l, t) => setProgress(t ? `Loading coach model… ${Math.round((l / t) * 100)}%` : `Loading coach model… ${(l / 1e6).toFixed(0)} MB`),
            (stage) => {
              guard.stage(stage);
              setLines([...guard.lines()]);
            },
          );
          ready = true;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          est.dispose(); // frees the worker's memory before trying a lighter setup
          estimatorRef.current = null;
          const next = guard.fail(lastError);
          setLines([...guard.lines()]);
          rung = next && !params.rung ? guard.begin(defaultRung(isIOS()), next).rung : null;
        }
      }
      if (!ready) {
        setExhausted(true);
        throw new Error(
          `This device couldn't run the camera coach in the browser. Pair a laptop below, or use a laptop browser. ${lastError}`.trim(),
        );
      }
      }
      setPhase("camera");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false,
      });
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      const fit = () => v.videoWidth && v.videoHeight && setAspect(v.videoWidth / v.videoHeight);
      fit();
      v.onresize = fit; // rotating the phone changes the stream's shape
      setPhase("running");
      frameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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
        if (frames === 2) {
          guardRef.current?.success();
          setLines([...(guardRef.current?.lines() ?? [])]);
        }
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
    setAspect(640 / 480);
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
      <div
        ref={frameRef}
        className="relative mx-auto overflow-hidden rounded-card bg-nm-ink-card"
        // As tall as the screen allows (minus browser bars), never wider than the page, always the camera's shape.
        style={{ aspectRatio: aspect, width: `min(100%, calc(82svh * ${aspect.toFixed(4)}))` }}
      >
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-contain" aria-hidden />
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
                <p className="mt-1 text-sm text-white/80">
                  {paired
                    ? "Laptop coach: a small, encrypted crop of you is sent to your own laptop and never stored."
                    : "Video is processed on this device and never uploaded."}
                </p>
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
        {showStats && phase === "running" && (
          <p className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-2 py-1 font-mono text-xs text-white">
            {stats
              ? `${stats.backend} · ${stats.fps.toFixed(1)} fps · model ${stats.inferenceMs.toFixed(0)} ms`
              : "measuring speed…"}
            {debug && ` · isolated ${String(globalThis.crossOriginIsolated)}`}
          </p>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {phase === "running" ? (inFrame ? "Tracking your movement." : "Step into frame.") : ""}
      </p>
      {notice && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-nm-warning">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-nm-danger">
          {error}
        </p>
      )}
      {(debug || phase === "error") && (
        <Diagnostics
          open={debug}
          rungLabel={rungLabel}
          lines={lines}
          previousLog={previousLog}
          stats={stats}
          onReset={() => {
            guardRef.current?.reset();
            setExhausted(false);
            setNotice(null);
            setError(null);
            setLines([]);
            setPreviousLog([]);
            setPhase("idle");
          }}
        />
      )}
      <div className="flex flex-wrap gap-3">
        {phase === "running" ? (
          <Button variant="outline" className="h-12 rounded-xl bg-white px-6 font-bold" onClick={stop}>
            <CameraOff aria-hidden /> Stop camera
          </Button>
        ) : (
          <Button className="h-12 rounded-xl px-6 text-base font-bold" onClick={start} disabled={phase === "loading" || phase === "camera"}>
            <Camera aria-hidden /> {exhausted ? "Try again" : startLabel}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          aria-pressed={statsOn}
          className="h-12 rounded-xl bg-white px-5 font-bold"
          onClick={() => setStatsPref(!statsOn)}
        >
          <Gauge aria-hidden /> {statsOn ? "Hide speed" : "Show speed"}
        </Button>
        {phase !== "running" && (
          <Link
            href="/workout/pair"
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-nm-line bg-white px-5 text-base font-bold text-nm-ink"
          >
            <Laptop className="size-5" aria-hidden /> {paired ? "Laptop coach settings" : "Use a laptop as the coach"}
          </Link>
        )}
      </div>
    </div>
  );
}

const STATS_KEY = "nm-coach-stats-v1";
const STATS_EVENT = "nm-coach-stats";

function subscribeStatsPref(onChange: () => void) {
  window.addEventListener(STATS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(STATS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function setStatsPref(on: boolean) {
  safeStorage().setItem(STATS_KEY, on ? "1" : "0");
  window.dispatchEvent(new Event(STATS_EVENT));
}

/** localStorage, or a no-op store when the browser blocks it (private mode). */
function safeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  try {
    localStorage.getItem("nm-probe");
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}

/** Device + setup + step log, copyable, so a phone that crashes can show exactly where (screenshot-friendly). */
function Diagnostics({ open, rungLabel, lines, previousLog, stats, onReset }: {
  open: boolean; rungLabel: string; lines: string[]; previousLog: string[]; stats: Stats | null; onReset: () => void;
}) {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const text = [
    `device: ${nav.userAgent}`,
    `cores: ${nav.hardwareConcurrency ?? "?"} · memory hint: ${nav.deviceMemory ?? "n/a"} GB · isolated: ${String(globalThis.crossOriginIsolated)} · webgpu: ${"gpu" in nav}`,
    `setup: ${rungLabel || "not started"}`,
    stats ? `running: ${stats.backend} · ${stats.fps.toFixed(1)} fps · inference ${stats.inferenceMs.toFixed(0)} ms` : "running: no frames yet",
    "this attempt:",
    ...(lines.length ? lines.map((l) => `  ${l}`) : ["  (none yet)"]),
    ...(previousLog.length ? ["previous attempt (before the page reloaded):", ...previousLog.map((l) => `  ${l}`)] : []),
  ].join("\n");
  return (
    <details open={open} className="rounded-xl border border-nm-line bg-white p-3 text-sm">
      <summary className="cursor-pointer font-bold">Diagnostics</summary>
      <pre className="mt-2 max-h-72 overflow-auto font-mono text-xs break-words whitespace-pre-wrap">{text}</pre>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-10 rounded-lg bg-white" onClick={() => void navigator.clipboard?.writeText(text)}>
          Copy
        </Button>
        <Button type="button" variant="outline" className="h-10 rounded-lg bg-white" onClick={onReset}>
          Reset coach settings
        </Button>
      </div>
    </details>
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
