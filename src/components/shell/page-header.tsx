import { Bell } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">{eyebrow}</p>
        <h1 className="mt-2 text-[2.369rem] leading-tight font-black sm:text-[3.157rem] sm:leading-none">
          {title}
        </h1>
        {subtitle ? <p className="mt-3 text-nm-muted">{subtitle}</p> : null}
      </div>
      <button
        type="button"
        className="hidden size-11 place-items-center rounded-xl border border-nm-line bg-white text-nm-ink hover:bg-nm-soft lg:grid"
        aria-label="Notifications"
      >
        <Bell className="size-5" aria-hidden />
      </button>
    </header>
  );
}
