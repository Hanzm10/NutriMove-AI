"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV_ITEMS } from "./nav-items";

export type ShellUser = { name: string; initials: string; subtitle: string };

export function Sidebar({ user, weekly }: { user: ShellUser; weekly: { done: number; planned: number } }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-nm-line bg-white px-5 py-7 lg:flex">
      <div className="px-2">
        <Logo />
      </div>
      <nav aria-label="Main" className="mt-10 flex flex-col gap-1.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-[0.95rem] font-bold transition-colors",
                active
                  ? "bg-nm-soft text-nm-primary-ink"
                  : "text-nm-muted hover:bg-nm-soft/60 hover:text-nm-ink",
              )}
            >
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-4">
        <WeeklyGoalCard done={weekly.done} planned={weekly.planned} />
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-nm-soft/60"
        >
          <span className="grid size-10 place-items-center rounded-full bg-nm-secondary text-sm font-black text-nm-ink">
            {user.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{user.name}</span>
            <span className="block truncate text-xs text-nm-muted">{user.subtitle}</span>
          </span>
          <ChevronRight className="size-4 text-nm-muted" aria-hidden />
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-bold text-nm-muted hover:bg-nm-soft/60 hover:text-nm-ink">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function WeeklyGoalCard({ done, planned }: { done: number; planned: number }) {
  const pct = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;
  const remaining = Math.max(0, planned - done);
  return (
    <section
      aria-label="Weekly goal"
      className="rounded-card bg-nm-ink-card p-5 text-white"
    >
      <p className="text-xs font-bold tracking-[0.12em] text-nm-accent uppercase">Weekly goal</p>
      <div className="mt-2 flex items-baseline justify-between">
        <p className="text-2xl font-bold">
          {done} of {planned}
        </p>
        <p className="text-xs text-white/80">workouts</p>
      </div>
      <div
        className="mt-3 h-1.5 rounded-full bg-white/15"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Weekly workouts completed"
      >
        <div className="h-full rounded-full bg-nm-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-white/80">
        {planned === 0
          ? "Open AI Workout to build your weekly plan."
          : remaining === 0
            ? "Weekly goal reached. Great work!"
            : `${remaining} more session${remaining === 1 ? "" : "s"} to reach your goal.`}
      </p>
    </section>
  );
}
