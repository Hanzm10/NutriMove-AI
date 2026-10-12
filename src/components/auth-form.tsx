"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnv } from "@/lib/supabase/env";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const configured = supabaseEnv().configured;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    const supabase = createClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setPending(false);
      if (error) return setError(error.message);
      router.replace(next);
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: String(form.get("name") || "") },
          emailRedirectTo: `${location.origin}/auth/callback?next=/consent`,
        },
      });
      setPending(false);
      if (error) return setError(error.message);
      if (data.session) {
        router.replace("/consent");
        router.refresh();
      } else {
        setNotice("Check your email to confirm your account, then sign in.");
      }
    }
  }

  async function google() {
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) setError(error.message);
  }

  return (
    <div>
      <h1 className="text-[2.369rem] leading-tight font-black">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-nm-muted">
        {mode === "login"
          ? "Sign in to see today's plan."
          : "It takes about 3 minutes to get your personalized plan."}
      </p>

      {!configured && (
        <p role="status" className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-nm-warning">
          Supabase isn&apos;t configured yet. Add the keys to <code>.env.local</code> (see README).
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate={false}>
        {mode === "signup" && (
          <Field label="Name" name="name" autoComplete="name" />
        )}
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
        {error && (
          <p role="alert" className="text-sm font-bold text-nm-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl bg-nm-soft p-3 text-sm text-nm-primary-ink">
            {notice}
          </p>
        )}
        <Button type="submit" disabled={pending || !configured} className="h-12 rounded-xl text-base font-bold">
          {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-nm-muted">
        <span className="h-px flex-1 bg-nm-line" /> or <span className="h-px flex-1 bg-nm-line" />
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={google}
        disabled={!configured}
        className="h-12 w-full rounded-xl bg-white text-base font-bold"
      >
        Continue with Google
      </Button>

      <p className="mt-8 text-sm text-nm-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-bold text-nm-primary-ink underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-nm-primary-ink underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name} className="font-bold">
        {label}
      </Label>
      <Input id={name} name={name} className="h-12 rounded-xl border-nm-line bg-nm-soft/60 px-4 text-base" {...props} />
    </div>
  );
}

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/overview";
}
