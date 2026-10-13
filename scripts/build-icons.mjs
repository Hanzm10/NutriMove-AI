// Renders the PWA icons in public/icons from the Leaf logo mark.
// Usage: node scripts/build-icons.mjs  (sharp is a transitive dependency of next; set SHARP_PATH if it isn't resolvable)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH ?? "sharp");

const leaf = (scale, offset) => `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#1d2718" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/>
  <path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/></g>`;
// "any": rounded tile; "maskable": full-bleed background with the mark inside the 80% safe zone.
const any = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#9bd141"/>${leaf(13, 100)}</svg>`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#9bd141"/>${leaf(10, 136)}</svg>`;
for (const [name, svg, size] of [["icon-192.png", any, 192], ["icon-512.png", any, 512], ["maskable-512.png", maskable, 512], ["apple-touch-icon.png", maskable, 180]]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(new URL(`../public/icons/${name}`, import.meta.url).pathname);
}
console.log("icons written");
