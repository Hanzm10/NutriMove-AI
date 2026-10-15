"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { NmCard } from "@/components/shell/card";
import { Button } from "@/components/ui/button";
import { SUS_ITEMS, isoItemsFor, susAdjective, type Role } from "@/lib/eval/survey";
import { cn } from "@/lib/utils";
import { submitSurvey } from "./actions";

const SCALE = [
  [1, "Strongly disagree"],
  [2, "Disagree"],
  [3, "Neutral"],
  [4, "Agree"],
  [5, "Strongly agree"],
] as const;

function Likert({ name, legend, value, onChange }: { name: string; legend: string; value: number | undefined; onChange: (v: number) => void }) {
  return (
    <fieldset className="grid gap-2 border-b border-nm-line/60 pb-4 last:border-0">
      <legend className="mb-2 font-bold">{legend}</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {SCALE.map(([v, label]) => {
          const id = `${name}-${v}`;
          return (
            <label
              key={id}
              htmlFor={id}
              className={cn(
                "flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-xl border px-1 text-center text-xs font-bold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-nm-ink",
                value === v ? "border-nm-ink bg-nm-ink text-white" : "border-nm-line bg-white hover:bg-nm-soft",
              )}
            >
              <input id={id} type="radio" name={name} className="sr-only" checked={value === v} onChange={() => onChange(v)} />
              <span className="text-base">{v}</span>
              <span className="leading-tight">{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SurveyForm() {
  const [role, setRole] = useState<Role>("user");
  const [sus, setSus] = useState<(number | undefined)[]>(Array(10).fill(undefined));
  const [iso, setIso] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const isoItems = isoItemsFor(role);
  const answered = sus.filter((a) => a != null).length + isoItems.filter((i) => iso[i.id] != null).length;
  const total = 10 + isoItems.length;

  if (done != null) {
    return (
      <NmCard>
        <p className="flex items-center gap-2 text-lg font-bold text-nm-primary-ink">
          <CheckCircle2 className="size-6" aria-hidden /> Thank you! Your answers were saved.
        </p>
        <p className="mt-2 text-nm-muted">
          Your usability score: <strong className="text-nm-ink">{done}</strong> / 100 ({susAdjective(done)}).
        </p>
      </NmCard>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (answered < total) {
      setError(`Please answer every statement (${total - answered} left).`);
      return;
    }
    start(async () => {
      const res = await submitSurvey({ role, sus: sus as number[], iso });
      if (res.ok) setDone(res.sus);
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <NmCard>
        <fieldset className="grid gap-2">
          <legend className="font-bold">I am answering as</legend>
          <div className="flex flex-wrap gap-2">
            {([["user", "A user of the app"], ["it_expert", "An IT expert / evaluator"]] as const).map(([v, label]) => (
              <label
                key={v}
                htmlFor={`role-${v}`}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center rounded-xl border px-4 text-sm font-bold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-nm-ink",
                  role === v ? "border-nm-ink bg-nm-ink text-white" : "border-nm-line bg-white hover:bg-nm-soft",
                )}
              >
                <input id={`role-${v}`} type="radio" name="role" className="sr-only" checked={role === v} onChange={() => setRole(v)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </NmCard>

      <NmCard>
        <h2 className="text-[1.333rem] font-bold">Part 1 · Ease of use (SUS)</h2>
        <p className="mt-1 mb-4 text-sm text-nm-muted">How much do you agree with each statement?</p>
        <div className="grid gap-4">
          {SUS_ITEMS.map((text, i) => (
            <Likert
              key={i}
              name={`sus-${i}`}
              legend={`${i + 1}. ${text}`}
              value={sus[i]}
              onChange={(v) => setSus((s) => s.map((x, j) => (j === i ? v : x)))}
            />
          ))}
        </div>
      </NmCard>

      <NmCard>
        <h2 className="text-[1.333rem] font-bold">Part 2 · Software quality (ISO/IEC 25010)</h2>
        <p className="mt-1 mb-4 text-sm text-nm-muted">How much do you agree with each statement?</p>
        <div className="grid gap-4">
          {isoItems.map((item, i) => (
            <Likert
              key={item.id}
              name={`iso-${item.id}`}
              legend={`${i + 1}. ${item.text}`}
              value={iso[item.id]}
              onChange={(v) => setIso((s) => ({ ...s, [item.id]: v }))}
            />
          ))}
        </div>
      </NmCard>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-nm-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="h-12 rounded-xl px-6 text-base font-bold">
          {pending && <Loader2 className="animate-spin" aria-hidden />} Submit ({answered}/{total} answered)
        </Button>
      </div>
    </form>
  );
}
