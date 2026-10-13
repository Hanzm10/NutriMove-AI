"use client";

import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Bucket } from "@/lib/progress/stats";

const C = { lime: "#9bd141", dark: "#5c8f18", ink: "#1d2718", grid: "#dde5d7", muted: "#5f6a59" };
const axis = { stroke: C.muted, fontSize: 12, tickLine: false, axisLine: false } as const;
const reduceMotion = () => typeof window !== "undefined" && (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("nm-reduce-motion"));

/** Charts are decorative for screen readers; each card renders a text summary next to it (§10.2). */
export function WeightChart({ data }: { data: Bucket[] }) {
  const pts = data.filter((d) => d.weightKg != null);
  if (pts.length < 2) return <p className="grid h-48 place-items-center text-sm text-nm-muted">Log at least two weigh-ins to see your trend.</p>;
  const ys = pts.map((d) => d.weightKg!);
  return (
    <div className="h-52" aria-hidden>
      <ResponsiveContainer>
        <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} domain={[Math.floor(Math.min(...ys) - 1), Math.ceil(Math.max(...ys) + 1)]} unit=" kg" width={64} />
          <Tooltip formatter={(v) => [`${v} kg`, "Weight"]} />
          <Line type="monotone" dataKey="weightKg" stroke={C.dark} strokeWidth={3} dot={{ r: 4, fill: C.lime, stroke: C.dark }} connectNulls isAnimationActive={!reduceMotion()} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CaloriesChart({ data, target }: { data: Bucket[]; target: number | null }) {
  return (
    <div className="h-52" aria-hidden>
      <ResponsiveContainer>
        <ComposedChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} width={56} />
          <Tooltip formatter={(v, n) => [`${v} kcal`, n === "kcal" ? "Eaten (avg)" : "Target"]} />
          {target && <ReferenceLine y={target} stroke={C.ink} strokeDasharray="4 4" />}
          <Bar dataKey="kcal" fill={C.lime} radius={[8, 8, 0, 0]} isAnimationActive={!reduceMotion()} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ActivityChart({ data }: { data: Bucket[] }) {
  return (
    <div className="h-52" aria-hidden>
      <ResponsiveContainer>
        <AreaChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="act" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.lime} stopOpacity={0.6} />
              <stop offset="100%" stopColor={C.lime} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} unit="m" width={48} allowDecimals={false} />
          <Tooltip formatter={(v) => [`${v} min`, "Active"]} />
          <Area type="monotone" dataKey="activeMin" stroke={C.dark} strokeWidth={2.5} fill="url(#act)" isAnimationActive={!reduceMotion()} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
