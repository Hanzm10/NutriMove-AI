import { describe, expect, it } from "vitest";
import { isValidBarcode, mapOffProduct, mapUsdaFood, rankFoods, sanitizeQuery } from "./food-mappers";

describe("mapUsdaFood", () => {
  it("maps nutrient numbers to per-100 g macros", () => {
    const row = mapUsdaFood({
      fdcId: 173944, description: "BANANAS, RAW", dataType: "SR Legacy",
      foodNutrients: [
        { nutrientNumber: "208", value: 89, unitName: "KCAL" },
        { nutrientNumber: "203", value: 1.09, unitName: "G" },
        { nutrientNumber: "205", value: 22.84, unitName: "G" },
        { nutrientNumber: "204", value: 0.33, unitName: "G" },
        { nutrientNumber: "291", value: 2.6, unitName: "G" },
      ],
    });
    expect(row).toMatchObject({
      source: "usda", external_id: "173944", name: "Bananas, raw", kcal_100g: 89, protein_100g: 1.09,
      carbs_100g: 22.84, fat_100g: 0.33, fiber_100g: 2.6, serving_g: 100,
    });
  });
  it("accepts Atwater energy and skips foods without energy", () => {
    expect(mapUsdaFood({ fdcId: 1, description: "x", foodNutrients: [{ nutrientNumber: "958", value: 50, unitName: "KCAL" }] })?.kcal_100g).toBe(50);
    expect(mapUsdaFood({ fdcId: 2, description: "y", foodNutrients: [{ nutrientNumber: "268", value: 300, unitName: "kJ" }] })).toBeNull();
  });
});

describe("mapOffProduct", () => {
  it("maps nutriments and serving", () => {
    const row = mapOffProduct("3017624010701", {
      product_name: "Nutella", brands: "Ferrero, Nutella", serving_quantity: 15, serving_size: "15 g",
      nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, fiber_100g: "0" },
    });
    expect(row).toMatchObject({ name: "Nutella", brand: "Ferrero", serving_g: 15, kcal_100g: 539, fiber_100g: 0 });
  });
  it("converts kJ when kcal is missing and rejects nameless products", () => {
    expect(mapOffProduct("1", { product_name: "x", nutriments: { "energy-kj_100g": 418.4 } })?.kcal_100g).toBe(100);
    expect(mapOffProduct("1", { nutriments: { "energy-kcal_100g": 1 } })).toBeNull();
  });
});

describe("isValidBarcode", () => {
  it("checks GTIN check digits", () => {
    expect(isValidBarcode("3017624010701")).toBe(true);
    expect(isValidBarcode("3017624010702")).toBe(false);
    expect(isValidBarcode("96385074")).toBe(true);
    expect(isValidBarcode("12345")).toBe(false);
    expect(isValidBarcode("abc")).toBe(false);
  });
});

describe("rankFoods", () => {
  it("prefers exact and prefix matches, then FNRI foods", () => {
    const foods = [
      { name: "Rice crackers", name_local: null, source: "usda" },
      { name: "Rice, milled", name_local: "Bigas", source: "fnri" },
      { name: "Fried rice", name_local: "Sinangag", source: "usda" },
      { name: "Rice", name_local: null, source: "usda" },
    ];
    expect(rankFoods("rice", foods).map((f) => f.name)).toEqual(["Rice", "Rice, milled", "Rice crackers", "Fried rice"]);
    expect(rankFoods("sinangag", foods)[0]!.name).toBe("Fried rice");
  });
});

describe("sanitizeQuery", () => {
  it("strips PostgREST filter syntax", () => {
    expect(sanitizeQuery("adobo,name.eq.x)")).toBe("adobo name eq x");
    expect(sanitizeQuery("  50%_off ")).toBe("50 off");
  });
});

describe("synonyms", () => {
  it("expands Tagalog words for local search and translates for USDA", async () => {
    const { wordAlternatives, toEnglishQuery } = await import("./food-mappers");
    expect(wordAlternatives("Kanin")).toEqual(["kanin", "sinaing", "rice"]);
    expect(wordAlternatives("adobo")).toEqual(["adobo"]);
    expect(toEnglishQuery("itlog manok")).toBe("egg chicken");
    expect(toEnglishQuery("pork adobo")).toBe("pork adobo");
  });
});

describe("rankFoods with synonyms", () => {
  it("ranks cooked rice first for 'kanin'", () => {
    const foods = [
      { name: "Coconut meat, young", name_local: "Buko, malakanin", source: "fnri" },
      { name: "Aragan lvs", name_local: "Ricefield waternymph", source: "fnri" },
      { name: "Rice, well-milled, boiled", name_local: "Bigas, maputi, sinaing", source: "fnri" },
    ];
    expect(rankFoods("kanin", foods)[0]!.name).toBe("Rice, well-milled, boiled");
  });
});
