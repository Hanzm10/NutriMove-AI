"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteAccount, saveProfile, saveSettings } from "./actions";

type Settings = { larger_text: boolean; high_contrast: boolean; reduce_motion: boolean; tts_cues: boolean; water_goal: number };

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl bg-nm-canvas p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-nm-ink">
      <span className="min-w-0">
        <span className="block font-bold">{label}</span>
        <span className="block text-xs text-nm-muted">{hint}</span>
      </span>
      <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-nm-line ring-1 ring-nm-muted/50 transition-colors peer-checked:bg-nm-primary-dark peer-checked:ring-nm-primary-dark after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
      <span className="sr-only">{checked ? "On" : "Off"}</span>
    </label>
  );
}

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveSettings(s); if (r.ok) toast.success("Settings saved"); else toast.error(r.error ?? "Could not save"); }); }}>
      <Toggle id="larger_text" label="Larger text" hint="Increase text size across the app." checked={s.larger_text} onChange={(v) => set("larger_text", v)} />
      <Toggle id="high_contrast" label="High contrast" hint="Darker text and borders." checked={s.high_contrast} onChange={(v) => set("high_contrast", v)} />
      <Toggle id="reduce_motion" label="Reduce motion" hint="Turn off animations and chart transitions." checked={s.reduce_motion} onChange={(v) => set("reduce_motion", v)} />
      <Toggle id="tts_cues" label="Voice cues" hint="Spoken rep counts and form cues during camera sessions." checked={s.tts_cues} onChange={(v) => set("tts_cues", v)} />
      <label htmlFor="water_goal" className="flex items-center justify-between gap-4 rounded-2xl bg-nm-canvas p-3">
        <span><span className="block font-bold">Water goal</span><span className="block text-xs text-nm-muted">Glasses per day</span></span>
        <input id="water_goal" type="number" min={1} max={20} value={s.water_goal} onChange={(e) => set("water_goal", Number(e.target.value))}
          className="h-11 w-20 rounded-xl border border-nm-line bg-white px-3 text-center font-bold" />
      </label>
      <Button type="submit" disabled={pending} className="h-11 w-fit rounded-xl px-5 font-bold">{pending && <Loader2 className="animate-spin" aria-hidden />} Save settings</Button>
    </form>
  );
}

export function ProfileForm({ initial }: { initial: { display_name: string; days_per_week: number; minutes_per_session: number } }) {
  const [p, setP] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveProfile(p); if (r.ok) toast.success("Profile saved"); else toast.error(r.error ?? "Could not save"); }); }}>
      <label className="grid gap-1 font-bold" htmlFor="display_name">Display name
        <input id="display_name" value={p.display_name} maxLength={60} onChange={(e) => setP({ ...p, display_name: e.target.value })}
          className="h-11 rounded-xl border border-nm-line bg-nm-soft/60 px-3 font-normal" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 font-bold" htmlFor="days">Workouts per week
          <select id="days" value={p.days_per_week} onChange={(e) => setP({ ...p, days_per_week: Number(e.target.value) })} className="h-11 rounded-xl border border-nm-line bg-nm-soft/60 px-3 font-normal">
            {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} days</option>)}
          </select>
        </label>
        <label className="grid gap-1 font-bold" htmlFor="minutes">Minutes per session
          <select id="minutes" value={p.minutes_per_session} onChange={(e) => setP({ ...p, minutes_per_session: Number(e.target.value) })} className="h-11 rounded-xl border border-nm-line bg-nm-soft/60 px-3 font-normal">
            {[15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-nm-muted">Changing your schedule rebuilds this week&apos;s workout plan.</p>
      <Button type="submit" disabled={pending} className="h-11 w-fit rounded-xl px-5 font-bold">{pending && <Loader2 className="animate-spin" aria-hidden />} Save profile</Button>
    </form>
  );
}

export function DeleteAccount() {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="mt-3 grid gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await deleteAccount(confirm); if (r && !r.ok) setError(r.error); }); }}>
      <label htmlFor="confirm-delete" className="text-sm">Type <span className="font-bold">DELETE</span> to permanently remove your account and all your data.</label>
      <div className="flex flex-wrap gap-2">
        <input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off"
          className="h-11 w-40 rounded-xl border border-white/30 bg-white/10 px-3 text-white placeholder:text-white/60" />
        <Button type="submit" disabled={pending || confirm.trim().toUpperCase() !== "DELETE"} variant="outline"
          className="h-11 rounded-xl border-white/40 bg-transparent font-bold text-white hover:bg-white/10">Delete account</Button>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-amber-200">{error}</p>}
    </form>
  );
}
