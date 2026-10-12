import { Leaf } from "lucide-react";
import Link from "next/link";

export function Logo({ href = "/overview" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg" aria-label="NutriMove AI home">
      <span className="grid size-10 place-items-center rounded-xl bg-nm-primary text-nm-ink">
        <Leaf className="size-5" aria-hidden />
      </span>
      <span className="text-lg font-black tracking-tight text-nm-ink">
        NutriMove <span className="text-nm-primary-dark">AI</span>
      </span>
    </Link>
  );
}
