// FOOD-01 / FOOD-08: search the local catalogue (FNRI + cached + own custom foods) and USDA FoodData Central.
// The USDA key stays here (secret USDA_API_KEY); results from USDA are cached in public.foods.
import {
  mapUsdaFood, rankFoods, sanitizeQuery, toEnglishQuery, wordAlternatives, type FoodRow, type UsdaFood,
} from "../_shared/food-mappers.ts";
import { corsHeaders, getUserId, json, readJson, serviceClient, withinRateLimit } from "../_shared/http.ts";

const COLUMNS =
  "id, source, external_id, name, name_local, brand, serving_label, serving_g, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, source_ref";
const LOCAL_ENOUGH = 12;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const userId = await getUserId(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  const { q: raw = "", includeUsda = true } = await readJson<{ q: string; includeUsda: boolean }>(req);
  const q = sanitizeQuery(String(raw));
  if (q.length < 2) return json({ results: [], usda: "skipped" });

  const db = serviceClient();
  if (!(await withinRateLimit(db, userId, "food-search"))) {
    return json({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  }

  // Every word (or one of its synonyms) must match the name or local name:
  // "chicken adobo" finds "Adobo, chicken"; "kanin" finds "Rice, well-milled, boiled (sinaing)".
  let local = db.from("foods").select(COLUMNS).or(`user_id.is.null,user_id.eq.${userId}`);
  for (const word of q.split(" ").slice(0, 4)) {
    const alts = wordAlternatives(word).flatMap((w) => [`name.ilike.%${w}%`, `name_local.ilike.%${w}%`]);
    local = local.or(alts.join(","));
  }
  const { data: localRows, error: localErr } = await local.limit(80);
  if (localErr) return json({ error: "search_failed" }, 500);

  let usda: "ok" | "skipped" | "unavailable" = "skipped";
  let usdaRows: typeof localRows = [];
  if (includeUsda && (localRows?.length ?? 0) < LOCAL_ENOUGH) {
    try {
      const key = Deno.env.get("USDA_API_KEY") ?? "DEMO_KEY";
      const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
      url.searchParams.set("api_key", key);
      url.searchParams.set("query", toEnglishQuery(q));
      url.searchParams.set("pageSize", "15");
      url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS)");
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`USDA ${res.status}`);
      const body = (await res.json()) as { foods?: UsdaFood[] };
      const mapped = (body.foods ?? []).map(mapUsdaFood).filter((f): f is FoodRow => f !== null);
      if (mapped.length) {
        const { data } = await db.from("foods").upsert(mapped, { onConflict: "source,external_id" }).select(COLUMNS);
        usdaRows = data ?? [];
      }
      usda = "ok";
    } catch (e) {
      console.error("usda search failed", String(e));
      usda = "unavailable";
    }
  }

  const seen = new Set<string>();
  const merged = [...(localRows ?? []), ...(usdaRows ?? [])].filter((f) => {
    const k = `${f.source}:${f.external_id ?? f.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return json({ results: rankFoods(q, merged).slice(0, 25), usda });
});
