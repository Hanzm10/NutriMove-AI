"use client";

import { CheckCircle2, Volume2, VolumeX, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSession } from "@/app/(app)/workout/actions";
import { Button } from "@/components/ui/button";
import { CUES, EXERCISE_SETUP, createAnalyzer } from "@/lib/pose/analyzers/exercises";
import type { Cue, ExerciseKind } from "@/lib/pose/analyzers/types";
import { PoseSmoother } from "@/lib/pose/one-euro";
import type { CanonicalPose } from "@/lib/pose/types";
import { cn } from "@/lib/utils";
import { LiveCoach, type Stats } from "./live-coach";

const Skeleton3D = dynamic(() => import("./skeleton-3d"), { ssr: false });

type SetResult = { reps: number; good: number; errorCounts: Record<string, number>; durationS: number };
type Mode = "active" | "rest" | "summary";

export function CoachSession({
  kind, slug, planItemId, targetSets, targetReps, restS, voiceDefault,
}: {
  kind: ExerciseKind;
  slug: string;
  planItemId: string | null;
  targetSets: number;
  targetReps: number;
  restS: number;
  voiceDefault: boolean;
}) {
  const setup = EXERCISE_SETUP[kind];
  const analyzer = useRef(createAnalyzer(kind));
  const smoother = useRef(new PoseSmoother());
  const poseRef = useRef<CanonicalPose | null>(null);
  const readySince = useRef<number | null>(null);
  const setStart = useRef<number>(0);
  const sessionStart = useRef<string>(new Date().toISOString());
  const fpsSamples = useRef<number[]>([]);
  const modeRef = useRef<Mode>("active");

  const [mode, setModeState] = useState<Mode>("active");
  const [ready, setReady] = useState(false);
  const [reps, setReps] = useState(0);
  const [lastRep, setLastRep] = useState<{ good: boolean; text: string } | null>(null);
  const [cue, setCue] = useState<Cue | null>(null);
  const [sets, setSets] = useState<SetResult[]>([]);
  const [restLeft, setRestLeft] = useState(0);
  const [voice, setVoice] = useState(voiceDefault);
  const [announce, setAnnounce] = useState({ polite: "", assertive: "" });
  const [summaryInfo, setSummaryInfo] = useState<{ startedAt: string; avgFps: number | null } | null>(null);
  const voiceRef = useRef(voice);
  useEffect(() => { voiceRef.current = voice; }, [voice]);

  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };

  function speak(text: string) {
    if (!voiceRef.current || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.lang = "en-US";
    speechSynthesis.speak(u);
  }

  function finishSet() {
    const a = analyzer.current;
    const result: SetResult = {
      reps: a.reps, good: a.goodReps, errorCounts: { ...a.errorCounts },
      durationS: Math.round((performance.now() - setStart.current) / 100) / 10,
    };
    const next = [...sets, result];
    setSets(next);
    if (next.length >= targetSets) {
      const f = fpsSamples.current;
      setSummaryInfo({ startedAt: sessionStart.current, avgFps: f.length ? f.reduce((a, b) => a + b, 0) / f.length : null });
      setMode("summary");
      speak("Great work. Session complete.");
    } else {
      setMode("rest");
      setRestLeft(restS);
      speak(`Set ${next.length} done. Rest for ${restS} seconds.`);
    }
  }

  function startNextSet() {
    analyzer.current.reset();
    readySince.current = null;
    setReady(false);
    setReps(0);
    setLastRep(null);
    setMode("active");
  }

  // Rest countdown → next set automatically.
  useEffect(() => {
    if (mode !== "rest") return;
    const t = setTimeout(() => (restLeft <= 1 ? startNextSet() : setRestLeft((r) => r - 1)), 1000);
    return () => clearTimeout(t);
  }, [mode, restLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  function onPose(raw: CanonicalPose) {
    const pose = smoother.current.smooth(raw);
    poseRef.current = pose;
    if (modeRef.current !== "active") return;
    // POSE-05: require ~1 s of a stable, fully visible body before counting.
    if (!readySince.current) readySince.current = pose.timestamp;
    if (!ready) {
      if (pose.timestamp - readySince.current > 1000) {
        setReady(true);
        setStart.current = performance.now();
        speak("Ready. Go!");
        setAnnounce((a) => ({ ...a, polite: "Ready. Start your reps." }));
      }
      return;
    }
    for (const ev of analyzer.current.update(pose)) {
      if (ev.type === "rep") {
        setReps(ev.index);
        const text = ev.good ? "Good rep" : (CUES[ev.errors[0]!]?.message ?? "Needs work");
        setLastRep({ good: ev.good, text });
        setAnnounce((a) => ({ ...a, polite: `Rep ${ev.index}. ${ev.good ? "Good." : text}` }));
        if (ev.index >= targetReps) finishSet();
      } else if (ev.type === "partial") {
        setLastRep({ good: false, text: "Not counted — go deeper" });
      } else if (ev.type === "cue") {
        setCue(ev.cue);
        speak(ev.cue.message);
        setAnnounce((a) => ({ ...a, assertive: ev.cue.message }));
        setTimeout(() => setCue((c) => (c?.code === ev.cue.code ? null : c)), 2500);
      }
    }
  }

  function onStats(s: Stats) {
    fpsSamples.current.push(s.fps);
  }

  if (mode === "summary" && summaryInfo) {
    return <Summary kind={kind} slug={slug} sets={sets} planItemId={planItemId} startedAt={summaryInfo.startedAt} avgFps={summaryInfo.avgFps} />;
  }

  const hud = (
    <>
      <div className="absolute top-3 left-3 rounded-2xl bg-white/95 px-4 py-3 shadow-card">
        <p className="text-xs font-bold text-nm-muted">Set {Math.min(sets.length + 1, targetSets)} of {targetSets}</p>
        <p className="text-4xl leading-none font-black tabular-nums">
          {reps}<span className="text-xl text-nm-muted"> / {targetReps}</span>
        </p>
        {lastRep && (
          <p className={cn("mt-1 flex items-center gap-1 text-xs font-bold", lastRep.good ? "text-nm-primary-ink" : "text-nm-warning")}>
            {lastRep.good ? <CheckCircle2 className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />} {lastRep.text}
          </p>
        )}
      </div>
      {!ready && mode === "active" && (
        <p className="absolute inset-x-4 bottom-4 rounded-xl bg-nm-ink/90 p-3 text-center font-bold text-white">Hold still… getting ready</p>
      )}
      {cue && (
        <p className={cn("absolute inset-x-4 bottom-4 flex items-center justify-center gap-2 rounded-xl p-3 text-center text-lg font-black",
          cue.severity === "safety" ? "bg-nm-warning text-white" : "bg-nm-primary text-nm-ink")}>
          <TriangleAlert className="size-5" aria-hidden /> {cue.message}
        </p>
      )}
      {mode === "rest" && (
        <div className="absolute inset-0 grid place-items-center bg-nm-ink-card/85 text-center text-white">
          <div>
            <p className="text-sm font-bold text-nm-accent uppercase">Rest</p>
            <p className="text-6xl font-black tabular-nums">{restLeft}s</p>
            <Button onClick={startNextSet} className="mt-4 h-11 rounded-xl font-bold">Start next set now</Button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-nm-line bg-white p-5">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">{setup.camera}</p>
          <h2 className="mt-1 text-xl font-bold">{setup.label}: {targetSets} × {targetReps}</h2>
          <p className="text-sm text-nm-muted">{setup.tip}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 rounded-xl bg-white" onClick={() => setVoice((v) => !v)} aria-pressed={voice}>
            {voice ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />} Voice cues {voice ? "on" : "off"}
          </Button>
          {mode === "active" && ready && (
            <Button variant="outline" className="h-11 rounded-xl bg-white font-bold" onClick={finishSet}>Finish set</Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <LiveCoach onPose={onPose} onStats={onStats} hud={hud} />
        <section className="hidden h-full min-h-72 overflow-hidden rounded-card border border-nm-line bg-white lg:block" aria-label="3D skeleton (drag to rotate)">
          <p className="px-4 pt-3 text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">3D view · drag to rotate</p>
          <div className="h-[calc(100%-2rem)]"><Skeleton3D poseRef={poseRef} /></div>
        </section>
      </div>

      <p className="sr-only" aria-live="polite">{announce.polite}</p>
      <p className="sr-only" aria-live="assertive">{announce.assertive}</p>
    </div>
  );
}

function Summary({ kind, slug, sets, planItemId, startedAt, avgFps }: {
  kind: ExerciseKind; slug: string; sets: SetResult[]; planItemId: string | null; startedAt: string; avgFps: number | null;
}) {
  const [rating, setRating] = useState<"easy" | "right" | "hard">("right");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const total = sets.reduce((a, s) => a + s.reps, 0);
  const good = sets.reduce((a, s) => a + s.good, 0);
  const errors: Record<string, number> = {};
  sets.forEach((s) => Object.entries(s.errorCounts).forEach(([k, v]) => (errors[k] = (errors[k] ?? 0) + v)));
  const top = Object.entries(errors).sort((a, b) => b[1] - a[1])[0];

  function save() {
    start(async () => {
      const res = await saveSession({
        exerciseSlug: slug, planItemId, backend: "instanthmr", avgFps: avgFps ? Math.round(avgFps * 10) / 10 : null,
        startedAt, rating, sets,
      });
      if (res.ok) { setSaved(true); toast.success("Session saved"); } else toast.error(res.error ?? "Could not save");
    });
  }

  return (
    <section className="rounded-card border border-nm-line bg-white p-6 sm:p-8" aria-labelledby="sum-h">
      <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Session summary</p>
      <h2 id="sum-h" className="mt-1 text-[2.369rem] leading-tight font-black">{EXERCISE_SETUP[kind].label}</h2>
      <dl className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-nm-soft p-4"><dt className="text-sm text-nm-muted">Reps</dt><dd className="text-3xl font-black">{total}</dd></div>
        <div className="rounded-2xl bg-nm-soft p-4"><dt className="text-sm text-nm-muted">Good form</dt><dd className="text-3xl font-black">{total ? Math.round((good / total) * 100) : 0}%</dd></div>
        <div className="rounded-2xl bg-nm-soft p-4"><dt className="text-sm text-nm-muted">Sets</dt><dd className="text-3xl font-black">{sets.length}</dd></div>
      </dl>
      <ul className="mt-5 grid gap-2 text-sm">
        {sets.map((s, i) => (
          <li key={i} className="flex justify-between border-b border-nm-line py-2">
            <span>Set {i + 1}</span><span className="font-bold">{s.reps} reps · {s.good} good · {s.durationS}s</span>
          </li>
        ))}
      </ul>
      {top && (
        <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm">
          <span className="font-bold text-nm-warning">Focus for next time:</span> {CUES[top[0]]?.message ?? top[0]} ({top[1]}×)
        </p>
      )}
      {!saved ? (
        <>
          <fieldset className="mt-6">
            <legend className="text-sm font-bold">How did it feel?</legend>
            <div className="mt-2 flex gap-2">
              {(["easy", "right", "hard"] as const).map((v) => (
                <label key={v} className={cn("cursor-pointer rounded-xl border px-4 py-2 text-sm font-bold has-[:focus-visible]:ring-3", rating === v ? "border-nm-primary-dark bg-nm-soft" : "border-nm-line")}>
                  <input type="radio" name="feel" className="sr-only" checked={rating === v} onChange={() => setRating(v)} />
                  {v === "easy" ? "Too easy" : v === "right" ? "Just right" : "Too hard"}
                </label>
              ))}
            </div>
          </fieldset>
          <Button onClick={save} disabled={pending} className="mt-6 h-12 rounded-xl px-6 text-base font-bold">{pending ? "Saving…" : "Save session"}</Button>
        </>
      ) : (
        <Link href="/workout" className="mt-6 inline-flex h-12 items-center rounded-xl bg-nm-ink px-6 font-bold text-white">Back to my workout</Link>
      )}
    </section>
  );
}
