"use client";

import { Download, FileVideo, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EXERCISE_SETUP } from "@/lib/pose/analyzers/exercises";
import type { ExerciseKind } from "@/lib/pose/analyzers/types";
import { analyzeClip, poseToFrame, type Attempt, type ClipJoints } from "@/lib/pose/eval/replay";
import { parseClipName, parseLabelsCsv, scoreClips, type Report } from "@/lib/pose/eval/score";
import { InstantHmrEstimator } from "@/lib/pose/instanthmr/estimator";
import { parseLoadParams } from "@/lib/pose/instanthmr/load-guard";
import { DEFAULT_MODEL_URL, LITE_MODEL_URL } from "@/lib/pose/instanthmr/session";
import { BoxTracker } from "@/lib/pose/tracker";
import { CANONICAL_EDGES, type CanonicalPose } from "@/lib/pose/types";

const FPS = 15;
type Done = { joints: ClipJoints; attempts: Attempt[]; reps: number; partials: number };

export function ClipReplay() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const estimatorRef = useRef<InstantHmrEstimator | null>(null);
  const [exercise, setExercise] = useState<ExerciseKind | "auto">("auto");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  const [labels, setLabels] = useState<string>("");
  const [report, setReport] = useState<Report | null>(null);

  async function model() {
    if (estimatorRef.current) return estimatorRef.current;
    const p = parseLoadParams(location.search);
    const url = p.model === "lite" ? LITE_MODEL_URL : p.model && p.model !== "full" ? p.model : DEFAULT_MODEL_URL;
    const est = new InstantHmrEstimator(url, { prefer: p.ep ?? "webgpu", threads: p.threads ?? undefined });
    await est.load((l, t) => setStatus(t ? `Loading model… ${Math.round((l / t) * 100)}%` : "Loading model…"));
    estimatorRef.current = est;
    return est;
  }

  async function processFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const est = await model();
      for (const file of Array.from(files)) {
        const kind = exercise === "auto" ? parseClipName(file.name)?.exercise : exercise;
        if (!kind) {
          setError(`Can't tell the exercise for "${file.name}". Name it like squat_good_10.mp4 or pick the exercise above.`);
          continue;
        }
        const joints = await runClip(est, file, kind);
        const r = analyzeClip(kind, joints.frames);
        setDone((d) => [...d.filter((x) => x.joints.file !== file.name), { joints, ...r }]);
      }
      setStatus("Done.");
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runClip(est: InstantHmrEstimator, file: File, kind: ExerciseKind): Promise<ClipJoints> {
    const v = videoRef.current!;
    const url = URL.createObjectURL(file);
    try {
      v.src = url;
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error(`This browser can't play "${file.name}". On iPhone, set Camera → Formats → Most Compatible, or convert the clip to H.264 MP4.`));
      });
      const w = v.videoWidth, h = v.videoHeight, duration = v.duration;
      const tracker = new BoxTracker();
      const frames: ClipJoints["frames"] = [];
      let lastSeen = -Infinity;
      for (let i = 0; i * (1 / FPS) < duration; i++) {
        const t = i / FPS;
        await seek(v, t);
        const bitmap = await createImageBitmap(v);
        const { pose, raw2d } = await est.estimate(bitmap, tracker.current(w, h));
        const { tracking } = tracker.update(raw2d, w, h);
        if (tracking) lastSeen = t;
        const visible = t - lastSeen < 1; // same 1 s grace as the live coach
        frames.push(poseToFrame(pose, t * 1000, visible));
        drawPose(canvasRef.current!, w, h, pose, visible);
        if (i % 5 === 0) setStatus(`${file.name} (${EXERCISE_SETUP[kind].label}): ${Math.round((t / duration) * 100)}%`);
      }
      return { version: 1, file: file.name, exercise: kind, fps: FPS, width: w, height: h, durationS: Math.round(duration * 10) / 10, backend: "instanthmr", frames };
    } finally {
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
    }
  }

  async function loadJoints(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const f of Array.from(files)) {
      try {
        const data = JSON.parse(await f.text()) as ClipJoints | { clips: ClipJoints[] };
        const clips = "clips" in data ? data.clips : [data];
        for (const joints of clips) {
          const r = analyzeClip(joints.exercise, joints.frames);
          setDone((d) => [...d.filter((x) => x.joints.file !== joints.file), { joints, ...r }]);
        }
      } catch {
        setError(`"${f.name}" isn't a joints file from this page.`);
      }
    }
  }

  function score() {
    setReport(scoreClips(done.map((d) => ({ file: d.joints.file, attempts: d.attempts })), parseLabelsCsv(labels)));
  }

  return (
    <div className="mt-8 grid gap-8">
      <section className="grid gap-4 rounded-card border border-nm-line bg-white p-5">
        <h2 className="text-[1.333rem] font-bold">1. Process clips</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1.5 text-sm font-bold">
            Exercise
            <select
              className="h-11 rounded-xl border border-nm-line bg-white px-3 font-normal"
              value={exercise}
              onChange={(e) => setExercise(e.target.value as ExerciseKind | "auto")}
            >
              <option value="auto">From the file name</option>
              <option value="squat">Squat</option>
              <option value="pushup">Push-up</option>
              <option value="lunge">Lunge</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Video clips
            <input type="file" accept="video/*" multiple disabled={busy} onChange={(e) => void processFiles(e.target.files)} className="text-sm font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            …or joints files you exported earlier
            <input type="file" accept=".json,application/json" multiple disabled={busy} onChange={(e) => void loadJoints(e.target.files)} className="text-sm font-normal" />
          </label>
        </div>
        <p className="text-sm text-nm-muted">
          Name clips like <code>squat_good_10.mp4</code>, <code>pushup_hips-sag_8.mp4</code> or <code>lunge_mixed_12.mp4</code>{" "}
          (exercise, mistake, true rep count). Processing samples {FPS} frames per second and takes about as long as the clip.
        </p>
        <div className="relative max-w-xl overflow-hidden rounded-xl bg-nm-ink-card">
          <video ref={videoRef} muted playsInline className="block aspect-video w-full object-contain" aria-hidden />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
        </div>
        <p aria-live="polite" className="flex items-center gap-2 text-sm font-bold">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} {status}
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-nm-danger">
            {error}
          </p>
        )}
        {done.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-nm-line">
                  <th className="py-2 pr-3">Clip</th>
                  <th className="py-2 pr-3">Exercise</th>
                  <th className="py-2 pr-3">Counted reps</th>
                  <th className="py-2 pr-3">Shallow (not counted)</th>
                  <th className="py-2 pr-3">Errors per attempt</th>
                  <th className="py-2">Joints file</th>
                </tr>
              </thead>
              <tbody>
                {done.map((d) => (
                  <tr key={d.joints.file} className="border-b border-nm-line/60 align-top">
                    <td className="py-2 pr-3 font-bold break-all">{d.joints.file}</td>
                    <td className="py-2 pr-3">{d.joints.exercise}</td>
                    <td className="py-2 pr-3">{d.reps}</td>
                    <td className="py-2 pr-3">{d.partials}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {d.attempts.map((a) => `${a.index}${a.counted ? "" : "*"}:${a.errors.join("+") || "ok"}`).join("  ") || "—"}
                    </td>
                    <td className="py-2">
                      <Button type="button" variant="outline" className="h-9 rounded-lg bg-white" onClick={() => save(`${stem(d.joints.file)}.joints.json`, d.joints)}>
                        <Download aria-hidden /> Save
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-10 rounded-lg bg-white"
              onClick={() => save("clips.joints.json", { version: 1, clips: done.map((d) => d.joints) })}
            >
              <FileVideo aria-hidden /> Save all joints in one file
            </Button>
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-card border border-nm-line bg-white p-5">
        <h2 className="text-[1.333rem] font-bold">2. Score against your labels</h2>
        <p className="text-sm text-nm-muted">
          Clips named with a single mistake (or <code>good</code>) need no labels. For <code>mixed</code> clips, paste{" "}
          <code>labels.csv</code> rows: <code>file,rep,errors</code>, errors = <code>good</code> or names joined with <code>+</code>.
        </p>
        <label className="grid gap-1.5 text-sm font-bold">
          labels.csv
          <input type="file" accept=".csv,text/csv,text/plain" onChange={async (e) => setLabels((await e.target.files?.[0]?.text()) ?? "")} className="text-sm font-normal" />
        </label>
        <label className="grid gap-1.5 text-sm font-bold">
          …or paste it here
          <textarea value={labels} onChange={(e) => setLabels(e.target.value)} rows={5} className="rounded-xl border border-nm-line p-3 font-mono text-xs font-normal" placeholder={"file,rep,errors\nsquat_mixed_12.mp4,1,good\nsquat_mixed_12.mp4,2,knees-in+shallow"} />
        </label>
        <div>
          <Button type="button" className="h-11 rounded-xl px-5 font-bold" disabled={!done.length} onClick={score}>
            Score {done.length} clip{done.length === 1 ? "" : "s"}
          </Button>
        </div>
        {report && <ReportView report={report} />}
      </section>
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  const pct = (n: number) => `${(n * 100).toFixed(1)} %`;
  return (
    <div className="grid gap-4">
      <p className="text-lg font-bold">
        Rep accuracy {pct(report.repAccuracy)} (target ≥ 90 %) · form-error macro F1 {report.macroF1.toFixed(2)} (target ≥ 0.75)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-nm-line">
              <th className="py-2 pr-3">Form check</th><th className="py-2 pr-3">TP</th><th className="py-2 pr-3">FP</th><th className="py-2 pr-3">FN</th>
              <th className="py-2 pr-3">Precision</th><th className="py-2 pr-3">Recall</th><th className="py-2">F1</th>
            </tr>
          </thead>
          <tbody>
            {report.classes.map((c) => (
              <tr key={c.code} className="border-b border-nm-line/60">
                <td className="py-2 pr-3 font-mono text-xs">{c.code}</td><td className="py-2 pr-3">{c.tp}</td><td className="py-2 pr-3">{c.fp}</td><td className="py-2 pr-3">{c.fn}</td>
                <td className="py-2 pr-3">{c.precision.toFixed(2)}</td><td className="py-2 pr-3">{c.recall.toFixed(2)}</td><td className="py-2 font-bold">{c.f1.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-1 text-sm">
        {report.clips.map((c) => (
          <li key={c.file}>
            <span className="font-bold">{c.file}</span>: {c.trueReps} true reps, app saw {c.appAttempts} ({c.appCounted} counted) → {pct(c.repAccuracy)}
            {c.unchecked.length > 0 && <span className="text-nm-muted"> · not checked by the app: {c.unchecked.join(", ")}</span>}
          </li>
        ))}
      </ul>
      {report.unscored.length > 0 && (
        <p className="text-sm text-nm-warning">No labels for: {report.unscored.join(", ")} (add them to labels.csv or name the file with the mistake and rep count).</p>
      )}
      <div>
        <Button type="button" variant="outline" className="h-10 rounded-lg bg-white" onClick={() => save("eval-report.json", report)}>
          <Download aria-hidden /> Save report
        </Button>
      </div>
    </div>
  );
}

const stem = (name: string) => name.replace(/\.[a-z0-9]+$/i, "");

function save(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function seek(v: HTMLVideoElement, t: number) {
  return new Promise<void>((res) => {
    v.onseeked = () => res();
    v.currentTime = t;
  });
}

function drawPose(canvas: HTMLCanvasElement, w: number, h: number, pose: CanonicalPose, visible: boolean) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  if (!visible) return;
  ctx.strokeStyle = "#B7E36B";
  ctx.lineWidth = Math.max(2, w / 240);
  for (const [a, b] of CANONICAL_EDGES) {
    ctx.beginPath();
    ctx.moveTo(...pose.joints2d[a]);
    ctx.lineTo(...pose.joints2d[b]);
    ctx.stroke();
  }
}
