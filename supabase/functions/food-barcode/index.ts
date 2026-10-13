// FOOD-02: barcode lookup via Open Food Facts, cached in public.foods (source 'off').
import { isValidBarcode, mapOffProduct, type OffProduct } from "../_shared/food-mappers.ts";
import { corsHeaders, getUserId, json, readJson, serviceClient, withinRateLimit } from "../_shared/http.ts";

const COLUMNS =
  "id, source, external_id, name, name_local, brand, serving_label, serving_g, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, source_ref";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const userId = await getUserId(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  const { code: raw = "" } = await readJson<{ code: string }>(req);
  const code = String(raw).replace(/\D/g, "");
  if (!isValidBarcode(code)) return json({ error: "invalid_barcode" }, 400);

  const db = serviceClient();
  if (!(await withinRateLimit(db, userId, "food-barcode", 30))) {
    return json({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  }

  const { data: cached } = await db.from("foods").select(COLUMNS).eq("source", "off").eq("external_id", code).maybeSingle();
  if (cached) return json({ food: cached, cached: true });

  try {
    const contact = Deno.env.get("OFF_CONTACT") ?? "nutrimove-ai";
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_quantity,serving_size`,
      { headers: { "User-Agent": `NutriMoveAI/0.1 (CS403 school project; ${contact})` }, signal: AbortSignal.timeout(6000) },
    );
    if (res.status === 404) return json({ error: "not_found" }, 404);
    if (!res.ok) throw new Error(`OFF ${res.status}`);
    const body = (await res.json()) as { status?: number; product?: OffProduct };
    const row = body.status === 1 && body.product ? mapOffProduct(code, body.product) : null;
    if (!row) return json({ error: "not_found" }, 404);
    const { data, error } = await db.from("foods").upsert(row, { onConflict: "source,external_id" }).select(COLUMNS).single();
    if (error) throw error;
    return json({ food: data, cached: false });
  } catch (e) {
    console.error("barcode lookup failed", String(e));
    return json({ error: "lookup_failed" }, 502);
  }
});
