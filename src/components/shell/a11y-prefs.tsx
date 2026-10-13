"use client";

import { useEffect } from "react";

export type A11ySettings = { larger_text: boolean; high_contrast: boolean; reduce_motion: boolean };
const KEY = "nm-a11y";

/** Applies Profile → Accessibility settings as classes on <html> (§8.4) and remembers them for the next first paint. */
export function A11yPrefs({ settings }: { settings: A11ySettings }) {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("nm-larger-text", settings.larger_text);
    el.classList.toggle("nm-high-contrast", settings.high_contrast);
    el.classList.toggle("nm-reduce-motion", settings.reduce_motion);
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage blocked: classes still applied */ }
  }, [settings]);
  return null;
}

/** Inline, pre-hydration script for the root layout so saved settings apply before first paint. */
export const A11Y_BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("${KEY}")||"{}"),c=document.documentElement.classList;s.larger_text&&c.add("nm-larger-text");s.high_contrast&&c.add("nm-high-contrast");s.reduce_motion&&c.add("nm-reduce-motion")}catch(e){}`;
