"use client";

import { Pause, Play, SkipForward, Square, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { countdownCue, formatClock } from "@/lib/workout/countdown";
import { cn } from "@/lib/utils";
import { beep, speak, unlockAudio } from "@/lib/voice/speaker";

type Phase = "work" | "rest" | "done";

/**
 * Guided set timer with spoken seconds-left (a guide, not a limit): a work countdown per set that runs into overtime
 * until "Set done", then rest, then the next set starts by itself.
 */
export function SetTimer({ sets, workS, restS, goal, onDone, onClose }: {
  sets: number;
  workS: number;
  restS: number;
  /** What to aim for in a set, e.g. "12 reps" or "Hold". */
  goal: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("work");
  const [setNo, setSetNo] = useState(1);
  const [endAt, setEndAt] = useState(() => Date.now() + workS * 1000);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [voice, setVoice] = useState(true);
  const [announce, setAnnounce] = useState("Set 1. Go!");
  const lastLeft = useRef<number>(workS + 1);

  const total = phase === "rest" ? restS : workS;
  const left = pausedLeft ?? Math.ceil((endAt - now) / 1000);

  function cue(text: string | undefined, b?: "tick" | "go") {
    if (b) beep(b);
    if (text && voice) speak(text);
  }

  function begin(next: Phase, no: number) {
    const secs = next === "rest" ? restS : workS;
    setPhase(next);
    setSetNo(no);
    setEndAt(Date.now() + secs * 1000);
    setPausedLeft(null);
    lastLeft.current = secs + 1;
    const say = next === "rest" ? `Rest for ${restS} seconds.` : `Set ${no}. Go!`;
    setAnnounce(say);
    cue(say, next === "work" ? "go" : undefined);
  }

  // Start the first set as soon as the timer opens (the tap that opened it also unlocks audio on iPhone).
  useEffect(() => cue("Set 1. Go!", "go"), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick a few times a second so a busy phone never skips a whole second; announce crossings, and roll rest into the
  // next set.
  useEffect(() => {
    if (phase === "done" || pausedLeft !== null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const l = Math.ceil((endAt - t) / 1000);
      const c = countdownCue(lastLeft.current, l, total, { phase });
      lastLeft.current = l;
      if (c) cue(c.say, c.beep);
      if (phase === "rest" && l <= 0) begin("work", setNo + 1);
    }, 200);
    return () => clearInterval(id);
  }, [phase, pausedLeft, endAt, setNo, total, voice]); // eslint-disable-line react-hooks/exhaustive-deps

  function setDone() {
    if (setNo >= sets) {
      setPhase("done");
      setAnnounce("All sets done. Great work.");
      cue("All sets done. Great work.", "go");
      onDone();
    } else begin("rest", setNo);
  }

  function togglePause() {
    if (pausedLeft === null) setPausedLeft(left);
    else {
      setEndAt(Date.now() + pausedLeft * 1000);
      setNow(Date.now());
      setPausedLeft(null);
    }
  }

  const over = phase === "work" && left < 0;
  const pct = phase === "done" ? 1 : Math.min(1, Math.max(0, 1 - left / total));

  return (
    <div className="mt-6 rounded-2xl border border-nm-line p-5" role="group" aria-label="Set timer">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">
          {phase === "done" ? "Finished" : phase === "rest" ? `Rest · next is set ${setNo + 1} of ${sets}` : `Set ${setNo} of ${sets} · ${goal}`}
        </p>
        <Button
          type="button" variant="outline" aria-pressed={voice} onClick={() => setVoice((v) => !v)}
          className="h-9 rounded-xl bg-white px-3 text-xs font-bold"
        >
          {voice ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />} Voice {voice ? "on" : "off"}
        </Button>
      </div>

      {phase !== "done" && (
        <>
          <p role="timer" aria-label={phase === "rest" ? "Rest time left" : "Set time left"} className={cn("mt-3 text-6xl leading-none font-black tabular-nums", over && "text-nm-warning")}>
            {formatClock(left)}
          </p>
          <p className="mt-1 text-sm text-nm-muted">
            {phase === "rest"
              ? "Breathe. The next set starts on its own."
              : over ? "Time's up. Finish your last rep at your own pace, then tap Set done." : "Follow the clock loosely: quality beats speed."}
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-nm-soft" aria-hidden>
            <div className={cn("h-full rounded-full", phase === "rest" ? "bg-nm-accent" : "bg-nm-primary")} style={{ width: `${pct * 100}%` }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {phase === "work" ? (
              <Button type="button" onClick={setDone} className="h-11 rounded-xl px-5 font-bold">
                <Square aria-hidden /> Set done
              </Button>
            ) : (
              <Button type="button" onClick={() => begin("work", setNo + 1)} className="h-11 rounded-xl px-5 font-bold">
                <SkipForward aria-hidden /> Skip rest
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => { unlockAudio(); togglePause(); }} className="h-11 rounded-xl bg-white px-5 font-bold">
              {pausedLeft === null ? <><Pause aria-hidden /> Pause</> : <><Play aria-hidden /> Resume</>}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} className="h-11 rounded-xl px-4">Close timer</Button>
          </div>
        </>
      )}
      {phase === "done" && <p className="mt-2 font-bold">All {sets} sets done. Log them below.</p>}
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  );
}
