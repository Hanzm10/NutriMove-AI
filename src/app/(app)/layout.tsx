import { A11yPrefs, type A11ySettings } from "@/components/shell/a11y-prefs";
import { Logo } from "@/components/shell/logo";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar, type ShellUser } from "@/components/shell/sidebar";
import { redirect } from "next/navigation";
import { getGate } from "@/lib/onboarding/state";
import { createClient, getUser } from "@/lib/supabase/server";
import { weeklyProgress } from "@/lib/workout/plan";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  let weekly = { done: 0, planned: 0 };
  let a11y: A11ySettings = { larger_text: false, high_contrast: false, reduce_motion: false };
  if (user) {
    const supabase = await createClient();
    const gate = await getGate(supabase, user.id);
    if (!gate.consented) redirect("/consent");
    if (!gate.onboarded) redirect("/onboarding");
    const [w, { data: settings }] = await Promise.all([
      weeklyProgress(supabase, user.id),
      supabase.from("user_settings").select("larger_text, high_contrast, reduce_motion").eq("user_id", user.id).maybeSingle(),
    ]);
    weekly = w;
    if (settings) a11y = settings;
  }
  const name =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "Guest";
  const shellUser: ShellUser = {
    name,
    initials: initials(name),
    subtitle: user ? "Personal plan" : "Not signed in",
  };

  return (
    <div className="flex min-h-dvh bg-nm-canvas">
      <A11yPrefs settings={a11y} />
      <Sidebar user={shellUser} weekly={weekly} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between border-b border-nm-line bg-white px-4 py-3 lg:hidden">
          <Logo />
        </div>
        {/* pb clears the floating mobile nav (PRD §10.2) */}
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-32 sm:px-8 lg:px-14 lg:pt-12 lg:pb-14">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

function initials(name: string) {
  return (
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "NM"
  );
}
