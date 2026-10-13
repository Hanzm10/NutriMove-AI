import { Download, Info, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NmCard, Eyebrow } from "@/components/shell/card";
import { PageHeader } from "@/components/shell/page-header";
import { ageFromBirthdate } from "@/lib/agent/guardrails";
import { todayISO } from "@/lib/dates";
import { GOAL_OPTIONS } from "@/lib/onboarding/schema";
import { requireUser } from "@/lib/supabase/auth";
import { DeleteAccount, ProfileForm, SettingsForm } from "./profile-forms";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { supabase, user } = await requireUser();
  const today = todayISO();
  const [{ data: profile }, { data: settings }, { data: targets }, { data: weight }, { data: consents }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("targets").select("*").eq("user_id", user.id).lte("effective_from", today)
      .order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("weight_logs").select("weight_kg, log_date").eq("user_id", user.id).order("log_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("consents").select("type, version, accepted_at").eq("user_id", user.id).order("accepted_at"),
  ]);
  const why = ((targets?.explanation ?? {}) as { reasons?: string[] }).reasons ?? [];
  const goal = GOAL_OPTIONS.find((g) => g.value === profile?.goal)?.label ?? profile?.goal ?? "—";
  const diet = (profile?.diet_prefs ?? {}) as { pattern?: string; allergies?: string[] };
  const body = [
    ["Goal", goal],
    ["Age", profile?.birthdate ? `${ageFromBirthdate(profile.birthdate)}` : "—"],
    ["Height", profile?.height_cm ? `${profile.height_cm} cm` : "—"],
    ["Latest weight", weight ? `${weight.weight_kg} kg (${weight.log_date})` : "—"],
    ["Experience", profile?.experience_level ? profile.experience_level[0]!.toUpperCase() + profile.experience_level.slice(1) : "—"],
    ["Diet", [diet.pattern ? diet.pattern[0]!.toUpperCase() + diet.pattern.slice(1) : null, ...(diet.allergies?.length ? [`no ${diet.allergies.join(", ")}`] : [])].filter(Boolean).join(" · ") || "—"],
  ];

  return (
    <>
      <PageHeader eyebrow="Personal setup" title="Profile & accessibility" subtitle="Shape NutriMove around your goals, routines and access needs." />
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <NmCard aria-labelledby="me-h">
          <Eyebrow>Profile</Eyebrow>
          <h2 id="me-h" className="mt-1 mb-4 text-xl font-bold">{profile?.display_name ?? user.email}</h2>
          <ProfileForm initial={{ display_name: profile?.display_name ?? "", days_per_week: profile?.days_per_week ?? 3, minutes_per_session: profile?.minutes_per_session ?? 30 }} />
          <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
            {body.map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-nm-canvas p-3"><dt className="text-xs text-nm-muted">{k}</dt><dd className="font-bold">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-nm-muted">Weight updates come from your <Link href="/check-in" className="font-bold text-nm-primary-ink underline">weekly check-in</Link> or the Progress page.</p>
        </NmCard>

        <NmCard aria-labelledby="targets-h">
          <Eyebrow>Daily targets</Eyebrow>
          <h2 id="targets-h" className="mt-1 text-xl font-bold">{targets ? `${targets.kcal.toLocaleString()} kcal a day` : "No targets yet"}</h2>
          {targets && (
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              {[["Protein", targets.protein_g], ["Carbs", targets.carbs_g], ["Fat", targets.fat_g]].map(([k, v]) => (
                <div key={k as string} className="rounded-2xl bg-nm-canvas p-3"><dt className="text-xs text-nm-muted">{k}</dt><dd className="font-bold">{v} g</dd></div>
              ))}
            </dl>
          )}
          <details className="mt-4 rounded-2xl bg-nm-soft/60 p-4">
            <summary className="cursor-pointer font-bold text-nm-primary-ink">Why this number?</summary>
            <ul className="mt-2 grid gap-1.5 text-sm">
              {why.map((r) => <li key={r} className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0 text-nm-primary-ink" aria-hidden />{r}</li>)}
            </ul>
          </details>
          <p className="mt-3 text-xs text-nm-muted">Targets are set by your coach and adjusted at each weekly check-in. They never go below the safe minimum.</p>
        </NmCard>

        <NmCard aria-labelledby="a11y-h">
          <Eyebrow>Accessibility & daily goals</Eyebrow>
          <h2 id="a11y-h" className="mt-1 mb-4 text-xl font-bold">Make it work for you</h2>
          <SettingsForm initial={{
            larger_text: settings?.larger_text ?? false, high_contrast: settings?.high_contrast ?? false,
            reduce_motion: settings?.reduce_motion ?? false, tts_cues: settings?.tts_cues ?? true, water_goal: settings?.water_goal ?? 8,
          }} />
        </NmCard>

        <section aria-labelledby="privacy-h" className="rounded-card bg-nm-ink-card p-6 text-white sm:p-7">
          <p className="text-xs font-bold tracking-[0.12em] text-nm-accent uppercase">Privacy</p>
          <h2 id="privacy-h" className="mt-1 text-xl font-bold">Your data, your choice</h2>
          <p className="mt-2 text-sm text-white/85">
            We store your profile, food and workout logs with your consent. Camera video is processed in real time on your device and never stored.
          </p>
          <a href="/profile/export" className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-nm-primary px-5 font-bold text-nm-ink" download>
            <Download className="size-4" aria-hidden /> Export my data (JSON)
          </a>
          {consents && consents.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-bold">Consent history</p>
              <ul className="mt-1 grid gap-1 text-sm text-white/80">
                {consents.map((c) => <li key={`${c.type}-${c.version}`}>{c.type} · v{c.version} · {c.accepted_at.slice(0, 10)}</li>)}
              </ul>
            </div>
          )}
          <form action="/auth/signout" method="post" className="mt-5">
            <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/40 px-5 font-bold text-white hover:bg-white/10">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </form>
          <p className="mt-5 text-sm font-bold">Delete account</p>
          <DeleteAccount />
          <p className="mt-4 text-xs text-white/70"><Link href="/privacy" className="underline">Privacy notice</Link></p>
        </section>
      </div>
    </>
  );
}
