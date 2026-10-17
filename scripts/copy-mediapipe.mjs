// Copies the MediaPipe Tasks WASM runtime into public/mediapipe so it is served same-origin (cross-origin isolated
// pages can't load it from a CDN). Runs on postinstall, next to copy-ort.mjs.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve("@mediapipe/tasks-vision")), "wasm");
const out = fileURLToPath(new URL("../public/mediapipe/", import.meta.url));
mkdirSync(out, { recursive: true });
let n = 0;
for (const f of readdirSync(dist)) {
  // SIMD build + no-SIMD fallback (FilesetResolver picks one); the ES-module variant isn't used.
  if (/^vision_wasm_(nosimd_)?internal\.(js|wasm)$/.test(f)) {
    cpSync(join(dist, f), join(out, f));
    n++;
  }
}
console.log(`copy-mediapipe: copied ${n} files to public/mediapipe`);
