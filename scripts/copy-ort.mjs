// Copies onnxruntime-web's WASM runtime into public/ort so it is served same-origin
// (needed with cross-origin isolation; PRD §9.1). Runs on postinstall.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"));
const out = new URL("../public/ort/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
let n = 0;
for (const f of readdirSync(dist)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) {
    cpSync(join(dist, f), join(out, f));
    n++;
  }
}
console.log(`copy-ort: copied ${n} files to public/ort`);
