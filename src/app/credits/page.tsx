import type { Metadata } from "next";
import { Logo } from "@/components/shell/logo";
import { EXERCISE_PHOTOS } from "@/lib/workout/exercise-photos";
import exercises from "../../../supabase/seed/exercises.json";

export const metadata: Metadata = { title: "Credits" };

const nameOf = new Map((exercises as { slug: string; name: string }[]).map((e) => [e.slug, e.name]));

/** Third-party data, models and software the app ships or calls, with their licenses (docs/datasets.md). */
const SOURCES: { group: string; items: { name: string; use: string; license: string; url: string }[] }[] = [
  {
    group: "Pose tracking",
    items: [
      { name: "MediaPipe Pose Landmarker (Google)", use: "On-device pose model for the camera coach", license: "Apache-2.0", url: "https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker" },
      { name: "InstantHMR", use: "Fallback 3D pose model", license: "Code Apache-2.0; weights under Meta's SAM license (non-commercial)", url: "https://github.com/mohamdev/InstantHMR" },
      { name: "ONNX Runtime Web", use: "Runs InstantHMR in the browser", license: "MIT", url: "https://github.com/microsoft/onnxruntime" },
    ],
  },
  {
    group: "Food and nutrition data",
    items: [
      { name: "DOST-FNRI Philippine Food Composition Tables", use: "Filipino foods and recipe nutrition", license: "Cited per food (FNRI Food ID)", url: "https://www.fnri.dost.gov.ph" },
      { name: "USDA FoodData Central", use: "Food search", license: "Public domain (CC0 1.0)", url: "https://fdc.nal.usda.gov" },
      { name: "Open Food Facts", use: "Barcode lookup. Product data © Open Food Facts contributors", license: "Open Database License (ODbL)", url: "https://world.openfoodfacts.org" },
    ],
  },
  {
    group: "Software",
    items: [
      { name: "Next.js, React", use: "App framework", license: "MIT", url: "https://nextjs.org" },
      { name: "Supabase", use: "Accounts and database", license: "MIT (client libraries)", url: "https://supabase.com" },
      { name: "three.js, React Three Fiber", use: "3D skeleton", license: "MIT", url: "https://threejs.org" },
      { name: "Lucide", use: "Icons", license: "ISC", url: "https://lucide.dev" },
    ],
  },
];

export default function CreditsPage() {
  const photos = Object.entries(EXERCISE_PHOTOS).sort(([a], [b]) => (nameOf.get(a) ?? a).localeCompare(nameOf.get(b) ?? b));
  return (
    <div className="min-h-dvh bg-nm-canvas px-5 py-8 sm:px-10">
      <header><Logo href="/" /></header>
      <main id="main" className="mx-auto mt-10 max-w-3xl text-nm-ink">
        <h1 className="text-[2.369rem] font-black">Credits</h1>
        <p className="mt-2 text-nm-muted">
          NutriMove AI is a CS 403 school project. It builds on the openly licensed work below; thank you to everyone who
          shared it.
        </p>

        <section aria-labelledby="photos-h" className="mt-8">
          <h2 id="photos-h" className="text-xl font-bold">Exercise photos</h2>
          <p className="mt-1 text-sm text-nm-muted">
            Only images whose license allows reuse on a public site (public domain, CC0, CC BY, CC BY-SA), resized to fit.
          </p>
          <div className="mt-4 overflow-x-auto rounded-card border border-nm-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-nm-soft/60 text-xs text-nm-muted">
                <tr>
                  <th scope="col" className="p-3 font-bold">Exercise</th>
                  <th scope="col" className="p-3 font-bold">Source</th>
                  <th scope="col" className="p-3 font-bold">License</th>
                </tr>
              </thead>
              <tbody>
                {photos.map(([slug, p]) => (
                  <tr key={slug} className="border-t border-nm-line align-top">
                    <th scope="row" className="p-3 font-bold">{nameOf.get(slug) ?? slug}</th>
                    <td className="p-3">
                      <a href={p.credit.url} className="font-bold text-nm-primary-ink underline" rel="noopener noreferrer" target="_blank">
                        {p.credit.source}
                      </a>
                      {p.credit.author && <span className="block text-xs text-nm-muted">by {p.credit.author}</span>}
                    </td>
                    <td className="p-3">{p.credit.license}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {SOURCES.map((g) => (
          <section key={g.group} aria-labelledby={`${g.group}-h`} className="mt-8">
            <h2 id={`${g.group}-h`} className="text-xl font-bold">{g.group}</h2>
            <ul className="mt-3 grid gap-2">
              {g.items.map((s) => (
                <li key={s.name} className="rounded-2xl border border-nm-line bg-white p-4">
                  <a href={s.url} className="font-bold text-nm-primary-ink underline" rel="noopener noreferrer" target="_blank">{s.name}</a>
                  <p className="text-sm">{s.use}</p>
                  <p className="text-xs text-nm-muted">License: {s.license}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
