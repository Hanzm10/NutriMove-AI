// Spoken cues and beeps for workouts (Web Speech + Web Audio), using this device's voice settings (./prefs.ts).
// Browser only; every call is a no-op where the APIs are missing.
import { DEFAULT_VOICE_PREFS, parseVoicePrefs, pickVoice, type VoicePrefs } from "./prefs";

const KEY = "nm-voice-v1";
const EVENT = "nm-voice-prefs";

let cached: { raw: string | null; prefs: VoicePrefs } | null = null;

export function getVoicePrefs(): VoicePrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // private mode / blocked storage: defaults
  }
  if (!cached || cached.raw !== raw) cached = { raw, prefs: parseVoicePrefs(raw) };
  return cached.prefs;
}

export const getServerVoicePrefs = () => DEFAULT_VOICE_PREFS;

export function saveVoicePrefs(p: VoicePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // not saved, but still used for this page
  }
  window.dispatchEvent(new Event(EVENT));
}

/** For useSyncExternalStore: settings changed here or in another tab. */
export function subscribeVoicePrefs(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const synth = () => (typeof speechSynthesis === "undefined" ? null : speechSynthesis);

/** Speaks now, cutting off anything still being said (cues must be current, not queued). */
export function speak(text: string, prefs: VoicePrefs = getVoicePrefs()) {
  const s = synth();
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(s.getVoices(), prefs.voiceURI);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else u.lang = "en-US";
  u.volume = prefs.volume;
  u.rate = prefs.rate;
  s.speak(u);
}

let audio: AudioContext | null = null;

/**
 * Call from a tap (Start, Test): iPhones only allow sound that a tap started, so this primes speech and the beep
 * channel for the rest of the session.
 */
export function unlockAudio() {
  const s = synth();
  if (s && !s.speaking) {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    s.speak(u);
  }
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null;
  }
}

/** A short beep: "tick" for the countdown, "go" (higher, longer) to start or end a set. */
export function beep(kind: "tick" | "go", prefs: VoicePrefs = getVoicePrefs()) {
  if (!prefs.beeps) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const t = audio.currentTime;
    const len = kind === "go" ? 0.45 : 0.15;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "square"; // carries further than a sine at the same volume
    osc.frequency.value = kind === "go" ? 1320 : 880;
    // Short fade in/out avoids clicks; the peak follows the volume setting.
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5 * prefs.volume, t + 0.01);
    gain.gain.setValueAtTime(0.5 * prefs.volume, t + len - 0.03);
    gain.gain.linearRampToValueAtTime(0, t + len);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + len);
  } catch {
    // no Web Audio: speech still works
  }
}
