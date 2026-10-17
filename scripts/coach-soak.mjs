#!/usr/bin/env node
// Start/stop soak test for the camera coach: memory, leftover camera streams, workers and frame loops.
// Drives /dev/coach in headless Chromium with a fake camera, through the same code the real coach runs.
//
//   pnpm build && pnpm start &               # or any running copy of the app, e.g. a Vercel preview
//   node scripts/coach-soak.mjs [baseUrl] [--pose=mediapipe|instanthmr] [--cycles=20] [--warmup=seconds]
//
// Needs Playwright (project or global install, `npm i -g playwright`). Exits 1 if any check fails.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** The project's Playwright if installed, otherwise the global one. */
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch {
    return require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
  }
}

const args = process.argv.slice(2);
const flag = (name, def) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const pose = flag("pose", "mediapipe");
const cycles = Number(flag("cycles", "20"));
// Memory climbs while a model warms up (InstantHMR: ~45 s of frames on a laptop CPU) and then levels off; the baseline
// is taken after this much continuous running, so only growth across start/stop cycles counts.
const warmupMs = Number(flag("warmup", pose === "instanthmr" ? "60" : "10")) * 1000;
const RUN_MS = 2500;

const MB = (b) => Math.round((b / 1e6) * 10) / 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resident memory of a process (Linux), in bytes; null elsewhere. */
function rss(pid) {
  try {
    const kb = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1];
    return kb ? Number(kb) * 1024 : null;
  } catch {
    return null;
  }
}

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-precise-memory-info"],
  });
  const context = await browser.newContext({ permissions: ["camera"] });
  // Remember every camera track the page opens, to check each one is stopped.
  await context.addInitScript(() => {
    const tracks = [];
    window.__nmTracks = tracks;
    const md = navigator.mediaDevices;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      const s = await orig(c);
      tracks.push(...s.getTracks());
      return s;
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const bcdp = await browser.newBrowserCDPSession();

  const metrics = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
    return { heap: m.JSHeapUsedSize, listeners: m.JSEventListeners, nodes: m.Nodes };
  };
  const renderers = async () => (await bcdp.send("SystemInfo.getProcessInfo")).processInfo.filter((p) => p.type === "renderer");
  const rendererRss = async () => (await renderers()).reduce((a, p) => a + (rss(p.id) ?? 0), 0);
  const rendererCpu = async () => (await renderers()).reduce((a, p) => a + p.cpuTime, 0);
  const state = () =>
    page.evaluate(() => ({
      loops: window.__nmCoachLoops ?? null,
      liveTracks: (window.__nmTracks ?? []).filter((t) => t.readyState === "live").length,
    }));
  const setHidden = (hidden) =>
    page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);

  const startBtn = page.getByRole("button", { name: /Start camera coach|Try again/ });
  const stopBtn = page.getByRole("button", { name: "Stop camera" });
  const start = async (timeout = 15_000) => {
    await startBtn.click({ timeout });
    try {
      await stopBtn.waitFor({ timeout: 120_000 }); // the first start downloads and compiles the model
    } catch {
      const alert = await page.getByRole("alert").allInnerTexts();
      throw new Error(`the coach didn't start again: ${alert.join(" ").slice(0, 300) || "no error shown"}`);
    }
  };

  await page.goto(`${base}/dev/coach?debug=1&pose=${pose}`);
  const failures = [];
  const check = (ok, what) => {
    if (!ok) failures.push(what);
  };

  await start();
  await sleep(warmupMs);
  await stopBtn.click();
  await sleep(500);
  const warm = { ...(await metrics()), rss: await rendererRss() };
  console.log(`coach soak · ${base} · pose=${pose} · ${warmupMs / 1000} s warm-up, then ${cycles} cycles of ${RUN_MS / 1000} s`);
  console.log(`after warm-up:   heap ${MB(warm.heap)} MB, renderer RSS ${MB(warm.rss)} MB, listeners ${warm.listeners}, DOM nodes ${warm.nodes}`);

  // Three ways to stop: the button, the tab going to the background, and Stop → Start with no pause (the race the
  // single-loop guard is for).
  const modes = ["button", "hidden", "rapid"];
  let maxWorkers = 0;
  for (let i = 1; i <= cycles; i++) {
    const mode = modes[i % modes.length];
    await start();
    await sleep(RUN_MS);
    const running = await state();
    check(running.loops?.active === 1, `cycle ${i} (${mode}): ${running.loops?.active} frame loops while running`);
    // onnxruntime's own threads show up as workers too (/ort/…); count only the app's pose workers.
    maxWorkers = Math.max(maxWorkers, page.workers().filter((w) => !w.url().includes("/ort/")).length);
    if (mode === "button") await stopBtn.click();
    if (mode === "hidden") {
      await setHidden(true);
      await sleep(200);
      await setHidden(false);
    }
    if (mode === "rapid") {
      await stopBtn.click();
      await start(); // straight back in, no pause
      await sleep(RUN_MS);
      const again = await state();
      check(again.loops?.active === 1, `cycle ${i} (rapid restart): ${again.loops?.active} frame loops`);
      await stopBtn.click();
    }
    await sleep(500);
    const after = await state();
    check(after.loops?.active === 0, `cycle ${i} (${mode}): ${after.loops?.active} frame loops still running after stop`);
    check(after.liveTracks === 0, `cycle ${i} (${mode}): ${after.liveTracks} camera tracks still live after stop`);
  }

  await sleep(1000);
  const end = { ...(await metrics()), rss: await rendererRss() };
  const cpu0 = await rendererCpu();
  await sleep(3000);
  const idleCpu = ((await rendererCpu()) - cpu0) / 3; // seconds of CPU per second while stopped
  const { loops } = await state();

  const heapGrowth = end.heap - warm.heap, rssGrowth = end.rss - warm.rss;
  console.log(`after ${cycles} more:  heap ${MB(end.heap)} MB (${heapGrowth >= 0 ? "+" : ""}${MB(heapGrowth)}), renderer RSS ${MB(end.rss)} MB (${rssGrowth >= 0 ? "+" : ""}${MB(rssGrowth)}), listeners ${end.listeners}, DOM nodes ${end.nodes}`);
  console.log(`most frame loops at once: ${loops?.max} · most workers: ${maxWorkers} · CPU while stopped: ${Math.round(idleCpu * 100)} %`);

  check(loops?.max === 1, `${loops?.max} frame loops ran at the same time`);
  check(maxWorkers <= 1, `${maxWorkers} workers alive at once`);
  check(heapGrowth < 5e6, `JS heap grew ${MB(heapGrowth)} MB over ${cycles} start/stop cycles`);
  check(!warm.rss || rssGrowth < 60e6, `renderer memory grew ${MB(rssGrowth)} MB over ${cycles} start/stop cycles`);
  check(end.listeners - warm.listeners < 20, `${end.listeners - warm.listeners} event listeners leaked`);
  check(idleCpu < 0.1, `page still uses ${Math.round(idleCpu * 100)} % CPU after stopping`);
  check(errors.length === 0, `page errors: ${errors.join(" | ")}`);

  await browser.close();
  if (failures.length) {
    console.log(`\nFAIL (${failures.length})\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nPASS");
}

main().catch((e) => {
  console.log(`\nFAIL\n- ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
