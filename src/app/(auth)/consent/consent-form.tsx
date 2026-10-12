"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { acceptConsent, type ConsentState } from "./actions";

export function ConsentForm() {
  const [state, action, pending] = useActionState<ConsentState, FormData>(acceptConsent, {});
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <ConsentItem name="data" title="Personal data">
        I agree that NutriMove AI stores my profile, food logs, workout results and check-ins to
        personalize my plan, as described in the{" "}
        <a href="/privacy" className="font-bold text-nm-primary-ink underline">
          privacy notice
        </a>
        . I can export or delete my data at any time (RA 10173).
      </ConsentItem>
      <ConsentItem name="health" title="Health information & disclaimer">
        I understand NutriMove AI is not a medical device and does not give medical advice. I will
        answer the health screening honestly and consult a professional if it advises me to.
      </ConsentItem>
      <p className="text-sm text-nm-muted">
        Camera use is asked separately before your first camera workout. Video is processed in real
        time and never stored.
      </p>
      {state.error && (
        <p role="alert" className="text-sm font-bold text-nm-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 rounded-xl text-base font-bold">
        {pending ? "Saving…" : "I agree, continue"}
      </Button>
    </form>
  );
}

function ConsentItem({
  name,
  title,
  children,
}: {
  name: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer gap-4 rounded-2xl border border-nm-line bg-white p-5 has-[:checked]:border-nm-primary-dark has-[:checked]:bg-nm-soft/50">
      <input type="checkbox" name={name} required className="mt-1 size-5 accent-[#5c8f18]" />
      <span>
        <span className="block font-bold">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-nm-muted">{children}</span>
      </span>
    </label>
  );
}
