import { percentOf } from "@/lib/food/nutrition";

/** Calorie ring (design reference "Daily energy"). Text carries the value, so colour isn't the only signal. */
export function EnergyRing({ value, target, size = 168, label }: { value: number; target: number; size?: number; label?: string }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = percentOf(value, target);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--nm-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={value > target ? "var(--nm-warning)" : "var(--nm-primary)"}
          strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-3xl font-black tabular-nums">{Math.round(value).toLocaleString()}</p>
        <p className="text-xs text-nm-muted">{label ?? `of ${target.toLocaleString()} kcal`}</p>
      </div>
    </div>
  );
}

export function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = percentOf(value, target);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label} · {Math.round(value)} / {target} g</span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-nm-soft" role="progressbar" aria-label={`${label} ${pct}% of target`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
