"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3 bottom-3 z-40 rounded-[22px] bg-nm-ink-card p-1.5 shadow-card lg:hidden"
      style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
    >
      <ul className="grid grid-cols-5 gap-1">
        {NAV_ITEMS.map(({ href, short, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold",
                  active ? "bg-nm-primary text-nm-ink" : "text-white/80 hover:text-white",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
