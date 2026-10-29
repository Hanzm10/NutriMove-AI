import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXERCISE_PHOTOS, PHOTO_LICENSES, exercisePhotos } from "./exercise-photos";

const catalog = (JSON.parse(readFileSync(new URL("../../../supabase/seed/exercises.json", import.meta.url), "utf8")) as { slug: string }[]).map((e) => e.slug);

describe("exercise photos", () => {
  it("only names exercises that exist, and every photo file is there", () => {
    for (const slug of Object.keys(EXERCISE_PHOTOS)) {
      expect(catalog).toContain(slug);
      for (const src of exercisePhotos(slug)!.src) expect(existsSync(new URL(`../../../public${src}`, import.meta.url))).toBe(true);
    }
  });

  it("covers every camera-coach exercise", () => {
    for (const slug of ["squat", "pushup", "reverse-lunge"]) expect(exercisePhotos(slug)).not.toBeNull();
  });

  it("returns nothing for exercises without a matching photo", () => {
    expect(exercisePhotos("bird-dog")).toBeNull();
  });
});

describe("photo credits", () => {
  it("credits every photo with a source page and a license that allows reuse on a public site", () => {
    for (const [slug, p] of Object.entries(EXERCISE_PHOTOS)) {
      expect(p.credit.source, slug).toBeTruthy();
      expect(p.credit.url, slug).toMatch(/^https:\/\//);
      expect(PHOTO_LICENSES, slug).toContain(p.credit.license);
      expect(p.credit.license, slug).not.toMatch(/NC|ND/);
    }
  });

  it("has one photo file per caption (single photos or start/end pairs)", () => {
    for (const slug of Object.keys(EXERCISE_PHOTOS)) {
      const p = exercisePhotos(slug)!;
      expect(p.src).toHaveLength(p.labels.length);
    }
  });
});

