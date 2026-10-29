import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_PREFS, englishVoices, parseVoicePrefs, pickVoice } from "./prefs";

const v = (name: string, lang: string, localService = true) => ({ voiceURI: `uri:${name}`, name, lang, localService });

describe("voice settings", () => {
  it("uses the loudest volume and slightly slow speech by default", () => {
    expect(parseVoicePrefs(null)).toEqual(DEFAULT_VOICE_PREFS);
    expect(DEFAULT_VOICE_PREFS.volume).toBe(1);
  });

  it("keeps stored values in range and ignores junk", () => {
    expect(parseVoicePrefs('{"volume":3,"rate":0.1,"voiceURI":"x","beeps":false}')).toEqual({ volume: 1, rate: 0.7, voiceURI: "x", beeps: false });
    expect(parseVoicePrefs('{"volume":"loud","rate":null,"voiceURI":7}')).toEqual(DEFAULT_VOICE_PREFS);
    expect(parseVoicePrefs("not json")).toEqual(DEFAULT_VOICE_PREFS);
  });

  it("lists English voices clearest first and leaves out other languages", () => {
    const list = englishVoices([v("Thomas", "fr-FR"), v("Fred", "en-US"), v("Samantha (Enhanced)", "en-US"), v("Google UK English", "en-GB", false)]);
    expect(list.map((x) => x.name)).toEqual(["Samantha (Enhanced)", "Google UK English", "Fred"]);
  });

  it("uses the chosen voice when this device has it, else the best English one", () => {
    const voices = [v("Fred", "en-US"), v("Samantha (Enhanced)", "en-US")];
    expect(pickVoice(voices, "uri:Fred")!.name).toBe("Fred");
    expect(pickVoice(voices, "uri:from-another-phone")!.name).toBe("Samantha (Enhanced)");
    expect(pickVoice([v("Thomas", "fr-FR")], null)).toBeNull();
  });
});
