// Pure mappers shared by the food Edge Functions (Deno) and unit tests (Vitest). No runtime APIs here.

export type FoodRow = {
  source: "fnri" | "usda" | "off" | "custom";
  external_id: string | null;
  name: string;
  name_local: string | null;
  brand: string | null;
  serving_label: string | null;
  serving_g: number | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number;
  source_ref: string | null;
};

type UsdaNutrient = { nutrientNumber?: string; nutrientName?: string; value?: number; unitName?: string };
export type UsdaFood = {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  foodNutrients?: UsdaNutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** USDA FDC search result (values per 100 g for Foundation / SR Legacy / FNDDS) → foods row. */
export function mapUsdaFood(f: UsdaFood): FoodRow | null {
  const by = (num: string) => f.foodNutrients?.find((n) => n.nutrientNumber === num)?.value;
  // Energy: 208 (kcal). Some Foundation foods only report Atwater energy (957/958).
  const energyRow = f.foodNutrients?.find(
    (n) => (n.nutrientNumber === "208" || n.nutrientNumber === "957" || n.nutrientNumber === "958") &&
      (n.unitName ?? "").toUpperCase() === "KCAL",
  );
  const kcal = energyRow?.value;
  if (kcal == null || !Number.isFinite(kcal)) return null;
  const grams = f.servingSizeUnit?.toLowerCase() === "g" && f.servingSize ? f.servingSize : null;
  return {
    source: "usda",
    external_id: String(f.fdcId),
    name: titleCase(f.description),
    name_local: null,
    brand: f.brandOwner ?? null,
    serving_label: grams ? `${round2(grams)} g` : "100 g",
    serving_g: grams ?? 100,
    kcal_100g: round2(kcal),
    protein_100g: round2(by("203") ?? 0),
    carbs_100g: round2(by("205") ?? 0),
    fat_100g: round2(by("204") ?? 0),
    fiber_100g: round2(by("291") ?? 0),
    source_ref: `USDA FoodData Central, FDC ID ${f.fdcId}${f.dataType ? ` (${f.dataType})` : ""}`,
  };
}

export type OffProduct = {
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
};

/** Open Food Facts v2 product → foods row (per 100 g). Null when energy is missing. */
export function mapOffProduct(code: string, p: OffProduct): FoodRow | null {
  const n = p.nutriments ?? {};
  const num = (k: string) => {
    const v = n[k];
    const x = typeof v === "string" ? Number(v) : v;
    return typeof x === "number" && Number.isFinite(x) ? x : undefined;
  };
  let kcal = num("energy-kcal_100g");
  if (kcal == null) {
    const kj = num("energy-kj_100g") ?? num("energy_100g");
    if (kj != null) kcal = kj / 4.184;
  }
  if (kcal == null || !p.product_name?.trim()) return null;
  const servingG = Number(p.serving_quantity);
  return {
    source: "off",
    external_id: code,
    name: p.product_name.trim(),
    name_local: null,
    brand: p.brands?.split(",")[0]?.trim() || null,
    serving_label: p.serving_size?.trim() || (Number.isFinite(servingG) && servingG > 0 ? `${servingG} g` : "100 g"),
    serving_g: Number.isFinite(servingG) && servingG > 0 ? round2(servingG) : 100,
    kcal_100g: round2(kcal),
    protein_100g: round2(num("proteins_100g") ?? 0),
    carbs_100g: round2(num("carbohydrates_100g") ?? 0),
    fat_100g: round2(num("fat_100g") ?? 0),
    fiber_100g: round2(num("fiber_100g") ?? 0),
    source_ref: `Open Food Facts, barcode ${code} (ODbL)`,
  };
}

/** EAN-8, UPC-A, EAN-13 or GTIN-14 with a valid check digit. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Ranking for merged results: exact/prefix matches first, then FNRI (Filipino), then shorter names. */
export function rankFoods<T extends { name: string; name_local: string | null; source: string }>(
  query: string,
  foods: T[],
): T[] {
  const q = query.trim().toLowerCase();
  const score = (f: T) => {
    const names = [f.name, f.name_local ?? ""].map((s) => s.toLowerCase());
    let s = 0;
    if (names.some((n) => n === q)) s += 100;
    else if (names.some((n) => n.startsWith(q))) s += 50;
    else if (names.some((n) => n.split(/[\s,/()-]+/).includes(q))) s += 30;
    else if (names.some((n) => n.includes(q))) s += 10;
    if (f.source === "fnri") s += 15;
    if (f.source === "custom") s += 20;
    return s - Math.min(f.name.length, 80) / 20;
  };
  return [...foods].sort((a, b) => score(b) - score(a));
}

export function titleCase(s: string) {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Escape a user query for PostgREST `ilike` inside an or() filter. */
export function sanitizeQuery(q: string): string {
  return q.replace(/[%_,().*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Common Tagalog words → words used in the FNRI/USDA names. Local search matches any of them;
 * USDA gets the English form. Keep entries single words (each word is matched with ilike).
 */
export const FOOD_SYNONYMS: Record<string, string[]> = {
  kanin: ["sinaing", "rice"],
  manok: ["chicken"],
  baboy: ["pork"],
  baka: ["beef"],
  isda: ["fish"],
  itlog: ["egg"],
  gatas: ["milk"],
  tinapay: ["bread"],
  saging: ["banana"],
  hipon: ["shrimp"],
  pusit: ["squid"],
  mais: ["corn"],
  kape: ["coffee"],
  asukal: ["sugar"],
  gulay: ["vegetable"],
  mansanas: ["apple"],
  kamatis: ["tomato"],
  sibuyas: ["onion"],
  bawang: ["garlic"],
  keso: ["cheese"],
  mani: ["peanut"],
  niyog: ["coconut"],
};

/** Each query word with its synonyms, e.g. "kanin" → ["kanin", "sinaing", "rice"]. */
export function wordAlternatives(word: string): string[] {
  const w = word.toLowerCase();
  return [w, ...(FOOD_SYNONYMS[w] ?? [])];
}

/** USDA works in English: swap known Tagalog words for their English synonym. */
export function toEnglishQuery(q: string): string {
  return q
    .split(" ")
    .map((w) => {
      const alts = FOOD_SYNONYMS[w.toLowerCase()];
      return alts ? alts[alts.length - 1]! : w;
    })
    .join(" ");
}
