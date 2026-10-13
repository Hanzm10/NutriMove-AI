"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BODY_EDGES, BODY_JOINTS, MHR70 } from "@/lib/pose/instanthmr/skeleton";
import {
  INPUT_SIZE, bboxFromJoints, cliffCond, cropJointsToFrame, initialBox, rgbaToNormalizedChw, squareCrop,
  type BBox,
} from "@/lib/pose/instanthmr/preprocess";
import {
  DEFAULT_MODEL_URL, loadModel, runHmr, type Backend, type LoadedModel,
} from "@/lib/pose/instanthmr/session";

type Stats = { pre: number; infer: number; total: number; fps: number; frames: number };
const EMPTY: Stats = { pre: 0, infer: 0, total: 0, fps: 0, frames: 0 };

export function PoseSpike() {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [prefer, setPrefer] = useState<Backend>("webgpu");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [kneeAngle, setKneeAngle] = useState<number | null>(null);
  const [has3d, setHas3d] = useState<boolean | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<BBox | null>(null);
  const runRef = useRef(false);
  const statsRef = useRef<Stats>(EMPTY);

  useEffect(() => () => stopCamera(videoRef.current), []);

  async function load() {
    setError(null);
    try {
      // ?model=/models/instanthmr.onnx loads a local copy (offline / faster dev).
      const override = new URLSearchParams(location.search).get("model");
      const url = override?.startsWith("/") && !override.startsWith("//") ? override : DEFAULT_MODEL_URL;
      const m = await loadModel(url, prefer, (l, t) =>
        setProgress(l === t ? "Creating session…" : t ? `Downloading ${(l / 1e6).toFixed(1)} / ${(t / 1e6).toFixed(1)} MB` : `${(l / 1e6).toFixed(1)} MB`),
      );
      setModel(m);
      setProgress("");
    } catch (e) {
      setError(String(e));
      setProgress("");
    }
  }

  const step = useCallback(
    async (source: CanvasImageSource, w: number, h: number) => {
      if (!model) return;
      const t0 = performance.now();
      const crop = cropRef.current ?? (cropRef.current = Object.assign(document.createElement("canvas"), { width: INPUT_SIZE, height: INPUT_SIZE }));
      const cctx = crop.getContext("2d", { willReadFrequently: true })!;
      const box = boxRef.current ?? initialBox(w, h);
      const sq = squareCrop(box);
      cctx.fillStyle = "#000";
      cctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
      drawClipped(cctx, source, w, h, sq);
      const tensor = rgbaToNormalizedChw(cctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data);
      const t1 = performance.now();
      const out = await runHmr(model, tensor, cliffCond(box, w, h));
      const t2 = performance.now();
      const joints = cropJointsToFrame(out.joints2dNorm, sq);
      setHas3d(out.joints3d !== null);
      if (out.joints3d) setKneeAngle(kneeAngleDeg(out.joints3d));

      // Next frame's box: tight box around the body joints (InstantHMR's "stride" trick).
      boxRef.current = bboxFromJoints(joints, BODY_JOINTS, w, h) ?? initialBox(w, h);
      draw(canvasRef.current!, source, w, h, joints, sq);

      const s = statsRef.current;
      const n = s.frames + 1;
      const avg = (a: number, b: number) => a + (b - a) / Math.min(n, 30);
      const total = performance.now() - t0;
      statsRef.current = {
        pre: avg(s.pre, t1 - t0), infer: avg(s.infer, t2 - t1), total: avg(s.total, total),
        fps: 1000 / avg(s.total, total), frames: n,
      };
      if (n % 5 === 0 || n < 5) setStats(statsRef.current);
    },
    [model],
  );

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      boxRef.current = null;
      statsRef.current = EMPTY;
      runRef.current = true;
      setRunning(true);
      const loop = async () => {
        if (!runRef.current) return;
        await step(v, v.videoWidth, v.videoHeight);
        requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      setError(`Camera error: ${String(e)}`);
    }
  }

  function stop() {
    runRef.current = false;
    setRunning(false);
    stopCamera(videoRef.current);
  }

  async function onImage(file: File) {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    imgRef.current = img;
    boxRef.current = null;
    statsRef.current = EMPTY;
    // A few passes let the joint-derived box settle on the person.
    for (let i = 0; i < 4; i++) await step(img, img.naturalWidth, img.naturalHeight);
    setStats(statsRef.current);
  }

  const summary = model
    ? `backend=${model.backend} · crossOriginIsolated=${String(globalThis.crossOriginIsolated)} · inputs=${model.inputNames.join(",")} · outputs=${model.outputNames.join(",")} · joints_3d=${String(has3d)} · pre=${stats.pre.toFixed(1)}ms · infer=${stats.infer.toFixed(1)}ms · fps=${stats.fps.toFixed(1)} · ${navigator.userAgent}`
    : "";

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-card border border-nm-line bg-nm-ink-card">
        <canvas ref={canvasRef} className="block h-auto w-full" aria-label="Camera with detected skeleton" />
        <video ref={videoRef} playsInline muted className="hidden" />
      </div>
      <aside className="flex flex-col gap-4 rounded-card border border-nm-line bg-white p-6">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Preferred backend
          <select
            className="rounded-xl border border-nm-line bg-nm-soft/60 px-3 py-2"
            value={prefer}
            onChange={(e) => setPrefer(e.target.value as Backend)}
            disabled={!!model}
          >
            <option value="webgpu">WebGPU (falls back to WASM)</option>
            <option value="wasm">WASM only</option>
          </select>
        </label>
        <Button onClick={load} disabled={!!model || !!progress} className="h-11 rounded-xl font-bold">
          {model ? `Loaded (${model.backend})` : progress || "1. Load model"}
        </Button>
        <Button
          onClick={running ? stop : startCamera}
          disabled={!model}
          variant={running ? "outline" : "default"}
          className="h-11 rounded-xl font-bold"
        >
          {running ? "Stop camera" : "2. Start webcam"}
        </Button>
        <label className="text-sm font-bold">
          …or test an image
          <input
            type="file"
            accept="image/*"
            disabled={!model || running}
            className="mt-1 block w-full text-sm"
            onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])}
          />
        </label>
        {error && <p role="alert" className="text-sm font-bold text-nm-danger">{error}</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm" aria-live="polite">
          <dt className="text-nm-muted">Preprocess</dt><dd className="font-bold">{stats.pre.toFixed(1)} ms</dd>
          <dt className="text-nm-muted">Inference</dt><dd className="font-bold">{stats.infer.toFixed(1)} ms</dd>
          <dt className="text-nm-muted">Frame total</dt><dd className="font-bold">{stats.total.toFixed(1)} ms</dd>
          <dt className="text-nm-muted">FPS</dt><dd className="font-bold">{stats.fps.toFixed(1)}</dd>
          <dt className="text-nm-muted">joints_3d</dt><dd className="font-bold">{has3d === null ? "–" : has3d ? "yes" : "no"}</dd>
          <dt className="text-nm-muted">Left knee (3D)</dt><dd className="font-bold">{kneeAngle === null ? "–" : `${kneeAngle.toFixed(0)}°`}</dd>
        </dl>
        <p className="text-xs text-nm-muted">
          Gate: ≥ 10 FPS with joints_3d = yes → in-browser path A. Otherwise use the laptop pose server (PRD §7.7.3).
        </p>
        {summary && (
          <Button variant="outline" className="rounded-xl" onClick={() => navigator.clipboard.writeText(summary)}>
            Copy results for the team
          </Button>
        )}
      </aside>
    </div>
  );
}

/** drawImage with a source rect that may extend past the frame (the rest stays black, like cv2 padding). */
function drawClipped(
  ctx: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number,
  sq: { x: number; y: number; size: number },
) {
  const sx = Math.max(0, sq.x), sy = Math.max(0, sq.y);
  const ex = Math.min(w, sq.x + sq.size), ey = Math.min(h, sq.y + sq.size);
  if (ex <= sx || ey <= sy) return;
  const k = INPUT_SIZE / sq.size;
  ctx.drawImage(src, sx, sy, ex - sx, ey - sy, (sx - sq.x) * k, (sy - sq.y) * k, (ex - sx) * k, (ey - sy) * k);
}

function draw(
  canvas: HTMLCanvasElement, src: CanvasImageSource, w: number, h: number, joints: Float32Array,
  sq: { x: number; y: number; size: number },
) {
  if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0, w, h);
  const lw = Math.max(2, w / 300);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1;
  ctx.strokeRect(sq.x, sq.y, sq.size, sq.size);
  ctx.setLineDash([]);
  ctx.strokeStyle = "#9bd141";
  ctx.lineWidth = lw * 1.5;
  ctx.lineCap = "round";
  for (const [a, b] of BODY_EDGES) {
    ctx.beginPath();
    ctx.moveTo(joints[a * 2]!, joints[a * 2 + 1]!);
    ctx.lineTo(joints[b * 2]!, joints[b * 2 + 1]!);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  for (const j of BODY_JOINTS) {
    ctx.beginPath();
    ctx.arc(joints[j * 2]!, joints[j * 2 + 1]!, lw * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function kneeAngleDeg(j3: Float32Array) {
  const p = (i: number) => [j3[i * 3]!, j3[i * 3 + 1]!, j3[i * 3 + 2]!] as const;
  const hip = p(MHR70.left_hip), knee = p(MHR70.left_knee), ankle = p(MHR70.left_ankle);
  const a = [hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]];
  const b = [ankle[0] - knee[0], ankle[1] - knee[1], ankle[2] - knee[2]];
  const dot = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const na = Math.hypot(...a), nb = Math.hypot(...b);
  return (Math.acos(Math.max(-1, Math.min(1, dot / (na * nb)))) * 180) / Math.PI;
}

function stopCamera(v: HTMLVideoElement | null) {
  const stream = v?.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  if (v) v.srcObject = null;
}
