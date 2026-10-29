// Voice cue settings for this device (voices differ per phone, so they live in the browser, not the account). Pure.

export type VoicePrefs = {
  /** Speech volume, 0.3–1. 1 is the loudest the browser allows (the phone's own volume is the ceiling). */
  volume: number;
  /** Speaking speed, 0.7–1.3. A little slower is easier to catch mid-exercise. */
  rate: number;
  /** Chosen voice (SpeechSynthesisVoice.voiceURI), or null for the best English voice on this device. */
  voiceURI: string | null;
  /** Short beeps for the countdown and set start/end: they carry better than speech in a noisy room. */
  beeps: boolean;
};

export const DEFAULT_VOICE_PREFS: VoicePrefs = { volume: 1, rate: 0.95, voiceURI: null, beeps: true };

const clamp = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** Reads stored settings, falling back to the defaults for anything missing or invalid. */
export function parseVoicePrefs(raw: string | null): VoicePrefs {
  let o: Partial<Record<keyof VoicePrefs, unknown>> = {};
  try {
    o = raw ? (JSON.parse(raw) as typeof o) : {};
  } catch {
    o = {};
  }
  const d = DEFAULT_VOICE_PREFS;
  return {
    volume: clamp(o.volume, 0.3, 1, d.volume),
    rate: clamp(o.rate, 0.7, 1.3, d.rate),
    voiceURI: typeof o.voiceURI === "string" && o.voiceURI ? o.voiceURI : null,
    beeps: typeof o.beeps === "boolean" ? o.beeps : d.beeps,
  };
}

type VoiceLike = { voiceURI: string; name: string; lang: string; localService: boolean };

/** English voices, clearest first: higher-quality voices, then on-device ones (no network lag), then en-US/en-PH. */
export function englishVoices<V extends VoiceLike>(voices: readonly V[]): V[] {
  const score = (v: V) =>
    (/enhanced|premium|natural|neural/i.test(v.name) ? 4 : 0) +
    (/google|samantha|daniel|karen|moira|serena/i.test(v.name) ? 3 : 0) +
    (v.localService ? 1 : 0) +
    (/^en[-_](US|PH)$/i.test(v.lang) ? 1 : 0);
  return voices.filter((v) => /^en([-_]|$)/i.test(v.lang)).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

/** The voice to speak with: the chosen one if this device has it, else the best English voice, else the default. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], voiceURI: string | null): V | null {
  return voices.find((v) => v.voiceURI === voiceURI) ?? englishVoices(voices)[0] ?? null;
}
