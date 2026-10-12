import { cn } from "@/lib/utils";

/** Rounded white card from the design reference (22px radius, soft border). */
export function NmCard({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-card border border-nm-line bg-white p-6 sm:p-7", className)}
      {...props}
    />
  );
}

export function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase", className)}
      {...props}
    />
  );
}
