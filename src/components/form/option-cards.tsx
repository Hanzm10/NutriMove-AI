"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export type Option<V extends string> = { value: V; label: string; hint?: string };

/** Single-choice cards (native radios: keyboard + screen-reader friendly). */
export function OptionCards<V extends string>({
  legend, options, value, onChange, error, columns = 1, description,
}: {
  legend: string;
  description?: string;
  options: readonly Option<V>[];
  value: V | undefined;
  onChange: (v: V) => void;
  error?: string;
  columns?: 1 | 2 | 3;
}) {
  const name = useId();
  return (
    <fieldset aria-invalid={!!error} aria-describedby={error ? `${name}-err` : undefined}>
      <legend className="text-sm font-bold">{legend}</legend>
      {description && <p className="mt-1 text-sm text-nm-muted">{description}</p>}
      <div className={cn("mt-3 grid gap-3", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 transition-colors",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-nm-primary-dark/40",
                checked ? "border-nm-primary-dark bg-nm-soft/60" : "border-nm-line hover:bg-nm-soft/30",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2",
                  checked ? "border-nm-primary-dark bg-nm-primary-dark text-white" : "border-nm-line",
                )}
              >
                {checked && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span>
                <span className="block font-bold">{o.label}</span>
                {o.hint && <span className="mt-0.5 block text-sm text-nm-muted">{o.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={`${name}-err`} className="mt-2 text-sm font-bold text-nm-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Multi-choice chips (native checkboxes). */
export function ChipGroup<V extends string>({
  legend, options, values, onChange, error, description,
}: {
  legend: string;
  description?: string;
  options: readonly Option<V>[];
  values: V[];
  onChange: (v: V[]) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="text-sm font-bold">{legend}</legend>
      {description && <p className="mt-1 text-sm text-nm-muted">{description}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = values.includes(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-bold",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-nm-primary-dark/40",
                checked ? "border-nm-primary-dark bg-nm-soft text-nm-primary-ink" : "border-nm-line bg-white",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={(e) =>
                  onChange(e.target.checked ? [...values, o.value] : values.filter((v) => v !== o.value))
                }
              />
              {checked && <Check className="size-4" aria-hidden />}
              {o.label}
            </label>
          );
        })}
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-2 text-sm font-bold text-nm-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Yes / No pair for a single question. */
export function YesNo({
  question, value, onChange,
}: {
  question: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-3 border-b border-nm-line py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <legend className="sr-only">{question}</legend>
      <p aria-hidden className="text-sm leading-relaxed sm:max-w-[70%]">
        {question}
      </p>
      <div className="flex gap-2">
        {[
          { v: false, label: "No" },
          { v: true, label: "Yes" },
        ].map(({ v, label }) => (
          <label
            key={label}
            className={cn(
              "inline-flex min-h-11 min-w-16 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-bold",
              "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-nm-primary-dark/40",
              value === v
                ? v
                  ? "border-nm-warning bg-amber-50 text-nm-warning"
                  : "border-nm-primary-dark bg-nm-soft text-nm-primary-ink"
                : "border-nm-line bg-white",
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={value === v} onChange={() => onChange(v)} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function NumberField({
  id, label, unit, value, onChange, error, min, max, step = 0.1, hint, optional,
}: {
  id: string;
  label: string;
  unit: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-bold">
        {label} {optional && <span className="font-normal text-nm-muted">(optional)</span>}
      </label>
      <div className="flex items-center rounded-xl border border-nm-line bg-nm-soft/60 focus-within:ring-3 focus-within:ring-nm-primary-dark/40">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className="h-12 w-full rounded-xl bg-transparent px-4 text-base outline-none"
        />
        <span className="pr-4 text-sm font-bold text-nm-muted" aria-hidden>
          {unit}
        </span>
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-nm-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-sm font-bold text-nm-danger">
          {error}
        </p>
      )}
    </div>
  );
}
