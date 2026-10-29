"use client";

import { Volume2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { englishVoices, type VoicePrefs } from "@/lib/voice/prefs";
import { beep, getServerVoicePrefs, getVoicePrefs, saveVoicePrefs, speak, subscribeVoicePrefs, unlockAudio } from "@/lib/voice/speaker";

type VoiceOption = { voiceURI: string; name: string; lang: string };

/** The device's English voices; browsers load the list late, so it updates when it arrives. */
function useVoices() {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const load = () => setVoices(englishVoices(speechSynthesis.getVoices()).map(({ voiceURI, name, lang }) => ({ voiceURI, name, lang })));
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

const SAMPLE = "Ten seconds left. Push your knees out.";

/** Voice cue volume, speed, voice and beeps for this device, with a test button (saved instantly). */
export function VoiceSettings() {
  const prefs = useSyncExternalStore(subscribeVoicePrefs, getVoicePrefs, getServerVoicePrefs);
  const voices = useVoices();
  const set = (patch: Partial<VoicePrefs>) => saveVoicePrefs({ ...prefs, ...patch });

  function test() {
    unlockAudio();
    beep("go", prefs);
    setTimeout(() => speak(SAMPLE, prefs), 500);
  }

  return (
    <div className="grid gap-3">
      <label htmlFor="voice-volume" className="grid gap-2 rounded-2xl bg-nm-canvas p-3">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-bold">Volume</span>
          <span className="text-sm text-nm-muted">{Math.round(prefs.volume * 100)}%</span>
        </span>
        <input
          id="voice-volume" type="range" min={0.3} max={1} step={0.05} value={prefs.volume}
          aria-valuetext={`${Math.round(prefs.volume * 100)} percent`}
          onChange={(e) => set({ volume: Number(e.target.value) })}
          className="h-6 w-full accent-nm-primary-dark"
        />
        <span className="text-xs text-nm-muted">100% is the loudest a browser can speak. Your phone&apos;s volume sets the ceiling.</span>
      </label>

      <label htmlFor="voice-rate" className="grid gap-2 rounded-2xl bg-nm-canvas p-3">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-bold">Speed</span>
          <span className="text-sm text-nm-muted">{prefs.rate < 0.9 ? "Slower" : prefs.rate > 1.1 ? "Faster" : "Normal"}</span>
        </span>
        <input
          id="voice-rate" type="range" min={0.7} max={1.3} step={0.05} value={prefs.rate}
          aria-valuetext={prefs.rate < 0.9 ? "Slower" : prefs.rate > 1.1 ? "Faster" : "Normal"}
          onChange={(e) => set({ rate: Number(e.target.value) })}
          className="h-6 w-full accent-nm-primary-dark"
        />
      </label>

      <label htmlFor="voice-choice" className="grid gap-2 rounded-2xl bg-nm-canvas p-3">
        <span className="font-bold">Voice</span>
        <select
          id="voice-choice" value={prefs.voiceURI ?? ""}
          onChange={(e) => set({ voiceURI: e.target.value || null })}
          className="h-11 rounded-xl border border-nm-line bg-white px-3"
        >
          <option value="">Clearest available</option>
          {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
        </select>
      </label>

      <label htmlFor="voice-beeps" className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl bg-nm-canvas p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-nm-ink">
        <span className="min-w-0">
          <span className="block font-bold">Countdown beeps</span>
          <span className="block text-xs text-nm-muted">Short beeps for the last seconds and the start and end of a set. Easier to hear than speech in a noisy room.</span>
        </span>
        <input id="voice-beeps" type="checkbox" role="switch" className="peer sr-only" checked={prefs.beeps} onChange={(e) => set({ beeps: e.target.checked })} />
        <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-nm-line ring-1 ring-nm-muted/50 transition-colors peer-checked:bg-nm-primary-dark peer-checked:ring-nm-primary-dark after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
        <span className="sr-only">{prefs.beeps ? "On" : "Off"}</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={test} className="h-11 rounded-xl px-5 font-bold">
          <Volume2 aria-hidden /> Test voice
        </Button>
        <span className="text-xs text-nm-muted">Saved on this device.</span>
      </div>
      <p className="text-xs text-nm-muted">
        Still too quiet? Turn up your phone&apos;s media volume, or connect a Bluetooth speaker. On iPhone, switch off silent
        mode: it can mute the beeps.
      </p>
    </div>
  );
}
