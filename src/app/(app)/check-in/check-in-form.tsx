"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitCheckIn, type CheckInForm } from "./actions";

type Choice<T> = { value: T; label: string };

function ChoiceGroup<T extends string | number | boolean>({ legend, hint, name, options, value, onChange }: {
  legend: string; hint?: string; name: string; options: Choice<T>[]; value: T | null; onChange: (v: T) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="font-bold">{legend}</legend>
      {hint && <p className="-mt-1 text-sm text-nm-muted">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const id = `${name}-${String(o.value)}`;
          const checked = value === o.value;
          return (
            <label key={id} htmlFor={id}
              className={cn("flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-bold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-nm-ink",
                checked ? "border-nm-ink bg-nm-ink text-white" : "border-nm-line bg-white hover:bg-nm-soft")}>
              <input id={id} type="radio" name={name} className="sr-only" checked={checked} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const scale = (low: string, high: string): Choice<number>[] =>
  [1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 1 ? `1 · ${low}` : n === 5 ? `5 · ${high}` : String(n) }));

/** AGENT-02 check-in questions. */
export function CheckInFormView({ lastWeight }: { lastWeight: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [weight, setWeight] = useState(lastWeight ? String(lastWeight) : "");
  const [adherence, setAdherence] = useState<number | null>(null);
  const [hunger, setHunger] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<CheckInForm["difficulty"] | null>(null);
  const [newPain, setNewPain] = useState<boolean | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weight);
    if (!w || adherence == null || hunger == null || energy == null || !difficulty || newPain == null) {
      setError("Please answer every question.");
      return;
    }
    setError(null);
    start(async () => {
      const r = await submitCheckIn({ weightKg: w, adherence, hunger, energy, difficulty, newPain });
      if (r.ok) router.push("/check-in?done=1");
      else setError(r.error);
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-6 rounded-card border border-nm-line bg-white p-6 sm:p-7" aria-busy={pending} noValidate>
      <div className="grid gap-2">
        <label htmlFor="weight" className="font-bold">Your weight today (kg)</label>
        <p className="-mt-1 text-sm text-nm-muted">Weigh yourself in the morning, before eating, for the most consistent trend.</p>
        <input id="weight" inputMode="decimal" type="number" step="0.1" min={30} max={300} value={weight} onChange={(e) => setWeight(e.target.value)}
          className="h-12 w-40 rounded-xl border border-nm-line bg-nm-soft/60 px-3 text-lg font-bold" required />
      </div>
      <ChoiceGroup legend="How well did you follow your plan?" name="adherence" options={scale("Not at all", "Fully")} value={adherence} onChange={setAdherence} />
      <ChoiceGroup legend="How hungry were you between meals?" name="hunger" options={scale("Not hungry", "Very hungry")} value={hunger} onChange={setHunger} />
      <ChoiceGroup legend="How was your energy?" name="energy" options={scale("Very low", "Great")} value={energy} onChange={setEnergy} />
      <ChoiceGroup legend="How did the workouts feel?" name="difficulty" value={difficulty} onChange={setDifficulty}
        options={[{ value: "easy", label: "Too easy" }, { value: "right", label: "About right" }, { value: "hard", label: "Too hard" }]} />
      <ChoiceGroup legend="Any new pain or injury?" hint="If yes, we'll lighten workouts and pause the camera coach." name="pain" value={newPain} onChange={setNewPain}
        options={[{ value: false, label: "No" }, { value: true, label: "Yes" }]} />
      {error && <p role="alert" className="text-sm font-bold text-nm-danger">{error}</p>}
      <Button type="submit" disabled={pending} className="h-12 w-fit rounded-xl px-6 font-bold">
        {pending ? <><Loader2 className="animate-spin" aria-hidden /> Updating your plan…</> : "Submit check-in"}
      </Button>
    </form>
  );
}
