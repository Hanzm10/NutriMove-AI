// Downloads the MediaPipe Pose Landmarker models (Apache-2.0, Google) into public/models.
// lite and full are committed; heavy (31 MB) is only for benchmarking and is gitignored.
// Usage: node scripts/fetch-pose-models.mjs [lite full heavy]
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const variants = process.argv.slice(2).length ? process.argv.slice(2) : ["heavy"];
for (const v of variants) {
  const url = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/1/pose_landmarker_${v}.task`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${v}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  writeFileSync(fileURLToPath(new URL(`../public/models/pose_landmarker_${v}.task`, import.meta.url)), bytes);
  console.log(`pose_landmarker_${v}.task: ${(bytes.byteLength / 1e6).toFixed(1)} MB`);
}
