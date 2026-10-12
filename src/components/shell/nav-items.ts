import { Activity, BarChart3, Dumbbell, LayoutGrid, User, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; short: string; icon: LucideIcon };

// PRD DASH-03: Overview · AI Workout · Nutrition · Progress · Profile
export const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", short: "Overview", icon: LayoutGrid },
  { href: "/workout", label: "AI Workout", short: "Workout", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", short: "Nutrition", icon: Activity },
  { href: "/progress", label: "Progress", short: "Progress", icon: BarChart3 },
  { href: "/profile", label: "Profile", short: "Profile", icon: User },
];
