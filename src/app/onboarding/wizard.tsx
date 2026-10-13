"use client";

import { ArrowLeft, ArrowRight, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ChipGroup, NumberField, OptionCards, YesNo } from "@/components/form/option-cards";
import { Button } from "@/components/ui/button";
import { PARQ_QUESTIONS } from "@/lib/agent/guardrails";
import {
  ACTIVITY_OPTIONS, ALLERGENS, DIET_PATTERNS, EQUIPMENT_OPTIONS, GOAL_OPTIONS,
  type BodyForm, type DietForm, type GoalForm, type ScreeningForm, type TrainingForm,
} from "@/lib/onboarding/schema";
import {
  saveBody, saveDietAndFinish, saveGoal, saveScreening, saveTraining,
  type ActionResult, type PlanSummary, type ScreeningOutcome,
} from "./actions";

export type WizardInitial = {
  step: number;
  screening: Partial<ScreeningForm>;
  body: Partial<BodyForm>;
  goal: Partial<GoalForm>;
  training: Partial<TrainingForm>;
  diet: Partial<DietForm>;
};

const STEP_TITLES = ["Health check", "Your body", "Your goal", "Training", "Food preferences"] as const;

export function OnboardingWizard({ initial }: { initial: WizardInitial }) {
  const [step, setStep] = useState(Math.min(initial.step, 4));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [screening, setScreeningRaw] = useState<Partial<ScreeningForm>>({
    pregnantOrBreastfeeding: false,
    clearanceAck: false,
    parq: {} as ScreeningForm["parq"],
    ...initial.screening,
  });
  const [outcome, setOutcome] = useState<ScreeningOutcome | null>(null);
  const [body, setBodyRaw] = useState<Partial<BodyForm>>({ targetWeightKg: null, ...initial.body });
  const [goal, setGoalRaw] = useState<Partial<GoalForm>>(initial.goal);
  const [training, setTrainingRaw] = useState<Partial<TrainingForm>>({
    experience: "beginner", equipment: ["none"], daysPerWeek: 3, minutesPerSession: 30, ...initial.training,
  });
  const [diet, setDietRaw] = useState<Partial<DietForm>>({
    pattern: "omnivore", allergies: [], dislikes: [], budget: "low", filipinoFirst: true, ...initial.diet,
  });
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  // Editing any answer clears stale validation messages.
  const edited = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setErrors({});
    setFormError(null);
  };
  const setScreening = edited(setScreeningRaw);
  const setBody = edited(setBodyRaw);
  const setGoal = edited(setGoalRaw);
  const setTraining = edited(setTrainingRaw);
  const setDiet = edited(setDietRaw);
  const headingRef = useRef<HTMLHeadingElement>(null);

  function submit<T>(action: () => Promise<ActionResult<T>>, onOk: (data: T | undefined) => void) {
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
        return;
      }
      onOk(r.data);
    });
  }

  function go(next: number) {
    setStep(next);
    setErrors({});
    setFormError(null);
    requestAnimationFrame(() => {
      headingRef.current?.focus();
      window.scrollTo({ top: 0 });
    });
  }

  if (outcome?.status === "blocked") return <Blocked reasons={outcome.reasons} />;
  if (plan) return <PlanView plan={plan} />;

  const parqYes = PARQ_QUESTIONS.some((q) => screening.parq?.[q.id]);
  const showClearance = parqYes || (screening.sex === "female" && screening.pregnantOrBreastfeeding);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="rounded-full bg-nm-soft px-3 py-1 text-xs font-bold text-nm-primary-ink">
          Step {step + 1} of {STEP_TITLES.length}
        </p>
        <div
          className="h-1.5 flex-1 rounded-full bg-nm-line"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={1}
          aria-valuemax={STEP_TITLES.length}
          aria-valuenow={step + 1}
        >
          <div className="h-full rounded-full bg-nm-primary" style={{ width: `${((step + 1) / STEP_TITLES.length) * 100}%` }} />
        </div>
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="mt-6 text-[2.369rem] leading-tight font-black outline-none">
        {STEP_TITLES[step]}
      </h1>

      <form
        className="mt-6 flex flex-col gap-7"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 0)
            submit(() => saveScreening(screening as ScreeningForm), (d) => {
              setOutcome(d ?? null);
              if (d?.status !== "blocked") go(1);
            });
          if (step === 1) submit(() => saveBody(body as BodyForm), () => go(2));
          if (step === 2) submit(() => saveGoal(goal as GoalForm), () => go(3));
          if (step === 3) submit(() => saveTraining(training as TrainingForm), () => go(4));
          if (step === 4) submit(() => saveDietAndFinish(diet as DietForm), (d) => d && setPlan(d));
        }}
      >
        {step === 0 && (
          <>
            <p className="text-nm-muted">
              A few safety questions first. Your answers decide how we set your targets and workouts.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="birthdate" className="text-sm font-bold">Date of birth</label>
                <input
                  id="birthdate"
                  type="date"
                  value={screening.birthdate ?? ""}
                  onChange={(e) => setScreening({ ...screening, birthdate: e.target.value })}
                  aria-invalid={!!errors.birthdate}
                  className="h-12 rounded-xl border border-nm-line bg-nm-soft/60 px-4"
                />
                {errors.birthdate && <p className="text-sm font-bold text-nm-danger">{errors.birthdate}</p>}
              </div>
              <OptionCards
                legend="Sex"
                description="Used only in the calorie formula."
                columns={2}
                options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }] as const}
                value={screening.sex}
                onChange={(sex) => setScreening({ ...screening, sex })}
                error={errors.sex}
              />
            </div>
            {screening.sex === "female" && (
              <div className="rounded-2xl border border-nm-line bg-white px-5">
                <YesNo
                  question="Are you pregnant or breastfeeding?"
                  value={screening.pregnantOrBreastfeeding}
                  onChange={(v) => setScreening({ ...screening, pregnantOrBreastfeeding: v })}
                />
              </div>
            )}
            <section aria-labelledby="parq-h" className="rounded-2xl border border-nm-line bg-white px-5 py-2">
              <h2 id="parq-h" className="pt-3 text-sm font-bold">Health questions (PAR-Q+)</h2>
              {PARQ_QUESTIONS.map((q) => (
                <YesNo
                  key={q.id}
                  question={q.text}
                  value={screening.parq?.[q.id]}
                  onChange={(v) => setScreening({ ...screening, parq: { ...screening.parq!, [q.id]: v } })}
                />
              ))}
              {Object.keys(errors).some((k) => k.startsWith("parq")) && (
                <p className="pb-3 text-sm font-bold text-nm-danger">Please answer every question.</p>
              )}
            </section>
            {showClearance && (
              <div role="status" className="flex gap-3 rounded-2xl bg-amber-50 p-5 text-sm">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-nm-warning" aria-hidden />
                <div>
                  <p className="font-bold text-nm-warning">We&apos;ll keep your plan gentle.</p>
                  <p className="mt-1 text-nm-ink">
                    Based on your answers, please check with a doctor before increasing your activity. Your plan will
                    start at beginner level{screening.pregnantOrBreastfeeding ? " with no calorie deficit" : ""}.
                  </p>
                  <label className="mt-3 flex items-center gap-2 font-bold">
                    <input
                      type="checkbox"
                      className="size-5 accent-[#5c8f18]"
                      checked={!!screening.clearanceAck}
                      onChange={(e) => setScreening({ ...screening, clearanceAck: e.target.checked })}
                    />
                    I have checked, or will check, with a doctor.
                  </label>
                  {errors.clearanceAck && <p className="mt-1 font-bold text-nm-danger">{errors.clearanceAck}</p>}
                </div>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField id="height" label="Height" unit="cm" min={100} max={250} step={0.5}
              value={body.heightCm} onChange={(v) => setBody({ ...body, heightCm: v ?? undefined })} error={errors.heightCm}
              hint="1 ft = 30.48 cm · 5 ft 4 in ≈ 163 cm" />
            <NumberField id="weight" label="Weight" unit="kg" min={30} max={300}
              value={body.weightKg} onChange={(v) => setBody({ ...body, weightKg: v ?? undefined })} error={errors.weightKg}
              hint="1 lb ≈ 0.45 kg" />
            <NumberField id="target" label="Target weight" unit="kg" min={30} max={300} optional
              value={body.targetWeightKg} onChange={(v) => setBody({ ...body, targetWeightKg: v })} error={errors.targetWeightKg} />
          </div>
        )}

        {step === 2 && (
          <>
            <OptionCards legend="What's your main goal?" options={GOAL_OPTIONS} columns={3}
              value={goal.goal} onChange={(g) => setGoal({ ...goal, goal: g })} error={errors.goal} />
            <OptionCards legend="How active are you on a typical week?" options={ACTIVITY_OPTIONS}
              value={goal.activity} onChange={(a) => setGoal({ ...goal, activity: a })} error={errors.activity} />
          </>
        )}

        {step === 3 && (
          <>
            <OptionCards legend="Exercise experience" columns={2}
              options={[
                { value: "beginner", label: "Beginner", hint: "New to training or getting back into it" },
                { value: "intermediate", label: "Intermediate", hint: "Training regularly for 6+ months" },
              ] as const}
              value={training.experience} onChange={(x) => setTraining({ ...training, experience: x })} error={errors.experience} />
            <ChipGroup legend="Equipment you have" options={EQUIPMENT_OPTIONS}
              values={training.equipment ?? []} onChange={(eq) => setTraining({ ...training, equipment: eq })} error={errors.equipment} />
            <div className="grid gap-5 sm:grid-cols-2">
              <NumberField id="days" label="Workout days per week" unit="days" min={2} max={6} step={1}
                value={training.daysPerWeek} onChange={(v) => setTraining({ ...training, daysPerWeek: v ?? undefined })} error={errors.daysPerWeek} />
              <NumberField id="minutes" label="Minutes per session" unit="min" min={10} max={120} step={5}
                value={training.minutesPerSession} onChange={(v) => setTraining({ ...training, minutesPerSession: v ?? undefined })} error={errors.minutesPerSession} />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <OptionCards legend="How do you eat?" options={DIET_PATTERNS} columns={3}
              value={diet.pattern} onChange={(p) => setDiet({ ...diet, pattern: p })} />
            <ChipGroup legend="Allergies" description="We'll never put these in your meal plan."
              options={ALLERGENS} values={diet.allergies ?? []} onChange={(a) => setDiet({ ...diet, allergies: a })} />
            <div className="flex flex-col gap-2">
              <label htmlFor="dislikes" className="text-sm font-bold">
                Foods you don&apos;t like <span className="font-normal text-nm-muted">(optional, comma-separated)</span>
              </label>
              <input id="dislikes" className="h-12 rounded-xl border border-nm-line bg-nm-soft/60 px-4"
                placeholder="e.g. ampalaya, liver"
                defaultValue={(diet.dislikes ?? []).join(", ")}
                onChange={(e) => setDiet({ ...diet, dislikes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) })} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <OptionCards legend="Budget" columns={2}
                options={[{ value: "low", label: "Budget-friendly" }, { value: "mid", label: "Flexible" }] as const}
                value={diet.budget} onChange={(b) => setDiet({ ...diet, budget: b })} />
              <OptionCards legend="Filipino dishes" columns={2}
                options={[{ value: "yes", label: "Mostly Filipino" }, { value: "mixed", label: "Mix it up" }] as const}
                value={diet.filipinoFirst ? "yes" : "mixed"} onChange={(v) => setDiet({ ...diet, filipinoFirst: v === "yes" })} />
            </div>
          </>
        )}

        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-nm-danger">
            {formError}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button type="button" variant="outline" className="h-12 rounded-xl bg-white px-5 font-bold" onClick={() => go(step - 1)}>
              <ArrowLeft aria-hidden /> Back
            </Button>
          ) : <span />}
          <Button type="submit" disabled={pending} className="h-12 rounded-xl px-6 text-base font-bold">
            {pending ? "Saving…" : step === 4 ? "Build my plan" : "Continue"} {!pending && <ArrowRight aria-hidden />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Blocked({ reasons }: { reasons: string[] }) {
  return (
    <div>
      <h1 className="text-[2.369rem] leading-tight font-black">Sorry, NutriMove AI isn&apos;t for you yet</h1>
      <p className="mt-3 text-nm-muted">{reasons.join(" ")}</p>
      <p className="mt-3 text-nm-muted">
        If you entered your birthdate by mistake, you can go back and fix it. You can also delete your account from
        your profile.
      </p>
      <div className="mt-8 flex gap-3">
        <Button className="h-12 rounded-xl px-6 font-bold" onClick={() => location.reload()}>Fix my answers</Button>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline" className="h-12 rounded-xl bg-white px-6 font-bold">Sign out</Button>
        </form>
      </div>
    </div>
  );
}

function PlanView({ plan }: { plan: PlanSummary }) {
  const macros = [
    { label: "Protein", g: plan.proteinG, kcal: plan.proteinG * 4, color: "bg-nm-primary" },
    { label: "Carbs", g: plan.carbsG, kcal: plan.carbsG * 4, color: "bg-nm-info" },
    { label: "Fat", g: plan.fatG, kcal: plan.fatG * 9, color: "bg-nm-ink-card" },
  ];
  return (
    <div>
      <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Your plan is ready</p>
      <h1 className="mt-2 text-[2.369rem] leading-tight font-black">Here are your daily targets</h1>
      <section className="mt-6 rounded-card bg-gradient-to-br from-[#c6e98c] to-nm-primary p-7">
        <p className="text-sm font-bold">Daily calories</p>
        <p className="mt-1 text-[3.157rem] leading-none font-black">
          {plan.kcal.toLocaleString()} <span className="text-xl font-bold">kcal</span>
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {macros.map((m) => (
            <li key={m.label} className="rounded-2xl bg-white/80 p-4">
              <p className="text-sm text-nm-muted">{m.label}</p>
              <p className="text-2xl font-black">{m.g} g</p>
              <div className="mt-2 h-1.5 rounded-full bg-nm-line">
                <div className={`h-full rounded-full ${m.color}`} style={{ width: `${Math.round((m.kcal / plan.kcal) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-nm-muted">{Math.round((m.kcal / plan.kcal) * 100)}% of calories</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-5 rounded-card border border-nm-line bg-white p-6" aria-labelledby="why-h">
        <h2 id="why-h" className="text-xl font-bold">Why these numbers?</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-nm-muted">
          {plan.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        {plan.flagged && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-nm-warning">
            Because of your health answers, your plan starts gently. Please follow your doctor&apos;s advice.
          </p>
        )}
        <p className="mt-4 text-xs text-nm-muted">
          These are estimates, not medical advice. We&apos;ll adjust them with your weekly check-ins.
        </p>
      </section>
      <p className="mt-5 text-sm text-nm-muted">Your weekly workout plan is ready in AI Workout, and your 7-day meal plan is in Nutrition → Meal plan.</p>
      <Link href="/overview" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-nm-ink px-6 font-bold text-white">
        Go to my dashboard <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
