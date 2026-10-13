"use client";

import { ArrowLeft, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { logFood, quickAdd } from "@/app/(app)/nutrition/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MEAL_SLOTS, scaleFood, type MealSlot } from "@/lib/food/nutrition";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { BarcodeScanner } from "./barcode-scanner";

export type FoodHit = {
  id: string; source: string; name: string; name_local: string | null; brand: string | null;
  serving_label: string | null; serving_g: number | null;
  kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number; fiber_100g: number;
};

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const SOURCE_LABEL: Record<string, string> = { fnri: "FNRI", usda: "USDA", off: "Packaged", custom: "Mine" };

export function AddFoodSheet({ open, onOpenChange, slot: initialSlot }: { open: boolean; onOpenChange: (o: boolean) => void; slot: MealSlot }) {
  const [tab, setTab] = useState<"search" | "scan" | "quick">("search");
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [picked, setPicked] = useState<FoodHit | null>(null);
  useEffect(() => { if (open) { setSlot(initialSlot); setPicked(null); } }, [open, initialSlot]); // eslint-disable-line react-hooks/set-state-in-effect

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-white p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-nm-line p-5">
          <SheetTitle className="text-xl font-black">Add food</SheetTitle>
          <SheetDescription>Search Filipino and international foods, scan a barcode, or quick add.</SheetDescription>
          <label className="mt-3 flex items-center gap-2 text-sm font-bold">
            Meal
            <select value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)} className="h-10 rounded-xl border border-nm-line bg-nm-soft/60 px-3">
              {MEAL_SLOTS.map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}
            </select>
          </label>
        </SheetHeader>
        <div className="p-5">
          {picked ? (
            <QuantityStep food={picked} slot={slot} onBack={() => setPicked(null)} onDone={close} />
          ) : (
            <>
              <div role="tablist" aria-label="Add food method" className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-nm-soft p-1">
                {([["search", "Search"], ["scan", "Scan barcode"], ["quick", "Quick add"]] as const).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={cn("min-h-10 rounded-lg text-sm font-bold", tab === k ? "bg-white shadow-card" : "text-nm-muted")}>{l}</button>
                ))}
              </div>
              {tab === "search" && <SearchTab onPick={setPicked} />}
              {tab === "scan" && <ScanTab onPick={setPicked} />}
              {tab === "quick" && <QuickTab slot={slot} onDone={close} />}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SearchTab({ onPick }: { onPick: (f: FoodHit) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setNote(null); return; } // eslint-disable-line react-hooks/set-state-in-effect
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await createClient().functions.invoke("food-search", { body: { q: term } });
      setLoading(false);
      if (error) { setNote("Search is unavailable right now. Try Quick add."); return; }
      setResults((data?.results ?? []) as FoodHit[]);
      setNote(data?.usda === "unavailable" ? "Showing Filipino foods only (international database is busy)." : null);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <label htmlFor="food-q" className="sr-only">Search foods</label>
      <div className="flex items-center gap-2 rounded-xl border border-nm-line bg-nm-soft/60 px-3 focus-within:ring-3 focus-within:ring-nm-primary-dark/40">
        <Search className="size-4 text-nm-muted" aria-hidden />
        <input id="food-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. kanin, adobo, banana"
          className="h-12 flex-1 bg-transparent outline-none" autoComplete="off" />
        {loading && <Loader2 className="size-4 animate-spin text-nm-muted" aria-label="Searching" />}
      </div>
      {note && <p className="mt-2 text-xs text-nm-muted">{note}</p>}
      <ul className="mt-3 grid gap-1" aria-live="polite">
        {results.map((f) => (
          <li key={f.id}>
            <button onClick={() => onPick(f)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-nm-soft">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{f.name}</span>
                <span className="block truncate text-xs text-nm-muted">
                  {[f.name_local, f.brand].filter(Boolean).join(" · ")}{f.name_local || f.brand ? " · " : ""}{Math.round(Number(f.kcal_100g))} kcal / 100 g
                </span>
              </span>
              <span className="rounded-full bg-nm-soft px-2 py-0.5 text-xs font-bold text-nm-primary-ink">{SOURCE_LABEL[f.source] ?? f.source}</span>
            </button>
          </li>
        ))}
        {!loading && q.trim().length >= 2 && results.length === 0 && !note && (
          <li className="p-3 text-sm text-nm-muted">No matches. Try another word or use Quick add.</li>
        )}
      </ul>
    </div>
  );
}

function ScanTab({ onPick }: { onPick: (f: FoodHit) => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const lookup = useCallback(async (code: string) => {
    setStatus("Looking up…");
    const { data, error } = await createClient().functions.invoke("food-barcode", { body: { code } });
    if (error || !data?.food) {
      const msg = (await (error as { context?: Response } | null)?.context?.json?.().catch(() => null))?.error;
      setStatus(msg === "invalid_barcode" ? "That barcode doesn't look valid." : "We couldn't find that product. Try search or Quick add.");
      return;
    }
    setStatus(null);
    onPick(data.food as FoodHit);
  }, [onPick]);
  return (
    <div className="grid gap-3">
      <BarcodeScanner onCode={lookup} />
      {status && <p role="status" className="text-sm text-nm-muted">{status}</p>}
    </div>
  );
}

function QuantityStep({ food, slot, onBack, onDone }: { food: FoodHit; slot: MealSlot; onBack: () => void; onDone: () => void }) {
  const serving = Number(food.serving_g) > 0 && Number(food.serving_g) !== 100 ? Number(food.serving_g) : null;
  const [grams, setGrams] = useState<number>(serving ?? 100);
  const [pending, start] = useTransition();
  const snap = scaleFood(food, grams || 0);
  const presets = [...new Set([serving, 50, 100, 150, 200].filter((x): x is number => !!x))];
  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-nm-primary-ink"><ArrowLeft className="size-4" aria-hidden /> Back</button>
      <h3 className="text-xl font-bold">{food.name}</h3>
      {food.name_local && <p className="text-sm text-nm-muted">{food.name_local}</p>}
      <label htmlFor="grams" className="mt-5 block text-sm font-bold">Amount (grams)</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {presets.map((g) => (
          <button key={g} onClick={() => setGrams(g)} className={cn("min-h-10 rounded-full border px-4 text-sm font-bold", grams === g ? "border-nm-primary-dark bg-nm-soft" : "border-nm-line")}>
            {g === serving ? `1 serving (${g} g)` : `${g} g`}
          </button>
        ))}
      </div>
      <input id="grams" type="number" min={1} max={5000} value={grams || ""} onChange={(e) => setGrams(Number(e.target.value))}
        className="mt-3 h-12 w-40 rounded-xl border border-nm-line bg-nm-soft/60 px-4 text-base" />
      <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
        {[["kcal", snap.kcal], ["Protein", snap.protein_g], ["Carbs", snap.carbs_g], ["Fat", snap.fat_g]].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-nm-soft p-3"><dt className="text-xs text-nm-muted">{l}</dt><dd className="font-black">{Math.round(Number(v))}{l === "kcal" ? "" : " g"}</dd></div>
        ))}
      </dl>
      <Button
        className="mt-6 h-12 w-full rounded-xl text-base font-bold"
        disabled={pending || !(grams > 0)}
        onClick={() => start(async () => {
          const r = await logFood({ foodId: food.id, grams, slot });
          if (r.ok) { toast.success(`Logged ${food.name}`); onDone(); } else toast.error(r.error);
        })}
      >
        {pending ? "Saving…" : `Add to ${SLOT_LABEL[slot].toLowerCase()}`}
      </Button>
    </div>
  );
}

function QuickTab({ slot, onDone }: { slot: MealSlot; onDone: () => void }) {
  const [f, setF] = useState({ name: "", kcal: "", protein_g: "", carbs_g: "", fat_g: "" });
  const [pending, start] = useTransition();
  const num = (s: string) => (s === "" ? 0 : Number(s));
  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await quickAdd({ name: f.name, kcal: num(f.kcal), protein_g: num(f.protein_g), carbs_g: num(f.carbs_g), fat_g: num(f.fat_g), slot });
        if (r.ok) { toast.success("Added"); onDone(); } else toast.error(r.error);
      });
    }}>
      {([["name", "Name", "text"], ["kcal", "Calories (kcal)", "number"], ["protein_g", "Protein (g, optional)", "number"], ["carbs_g", "Carbs (g, optional)", "number"], ["fat_g", "Fat (g, optional)", "number"]] as const).map(([k, l, t]) => (
        <label key={k} className="grid gap-1 text-sm font-bold">
          {l}
          <input type={t} min={0} required={k === "name" || k === "kcal"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}
            className="h-12 rounded-xl border border-nm-line bg-nm-soft/60 px-4 font-normal" />
        </label>
      ))}
      <Button type="submit" disabled={pending} className="mt-2 h-12 rounded-xl text-base font-bold">{pending ? "Saving…" : "Add"}</Button>
    </form>
  );
}
