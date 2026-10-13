/** App "today" in the Philippines (Asia/Manila), as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayLabel(iso: string, style: "short" | "long" = "short"): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: style, timeZone: "UTC" });
}
