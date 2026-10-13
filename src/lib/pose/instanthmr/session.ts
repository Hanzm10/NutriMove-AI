import type * as Ort from "onnxruntime-web/webgpu";

// Browser-only: never import onnxruntime-web at module scope (breaks server prerendering).
let ortPromise: Promise<typeof Ort> | null = null;
function loadOrt() {
  ortPromise ??= import("onnxruntime-web/webgpu");
  return ortPromise;
}

export const DEFAULT_MODEL_URL =
  process.env.NEXT_PUBLIC_MODEL_URL ??
  "https://huggingface.co/momolesang/InstantHMR/resolve/main/instanthmr.onnx";

export type Backend = "webgpu" | "wasm";

export type LoadedModel = {
  ort: typeof Ort;
  session: Ort.InferenceSession;
  backend: Backend;
  inputNames: readonly string[];
  outputNames: readonly string[];
};

const MODEL_CACHE = "nutrimove-models-v1";
/** Byte size of the released instanthmr.onnx; a download of any other size is truncated or wrong. */
const KNOWN_SIZES: Record<string, number> = {
  "https://huggingface.co/momolesang/InstantHMR/resolve/main/instanthmr.onnx": 80_961_622,
  "/models/instanthmr-int8.onnx": 51_786_006,
};

/**
 * Int8 weight-quantized copy of the same model (fp16 → fp32 → dynamic int8, served same-origin).
 * The released model is fp16; WASM expands it to fp32 at load, which iPhone Safari can't fit.
 * Measured against the original: ~1.5 px mean 2D joint error on the 224 px crop.
 */
export const LITE_MODEL_URL = "/models/instanthmr-int8.onnx";

/** iPhones get the lite model; everything else the original. */
export function defaultModelUrl() {
  return isIOS() ? LITE_MODEL_URL : DEFAULT_MODEL_URL;
}

/** iPhone/iPad (including iPadOS reporting as Mac). Used to keep wasm memory low on WebKit. */
export const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1));

async function openCache() {
  return typeof caches !== "undefined" ? caches.open(MODEL_CACHE).catch(() => null) : null;
}

/** Drops a cached model copy so the next load downloads it again. */
export async function forgetModel(url: string) {
  await (await openCache())?.delete(url).catch(() => false);
}

/**
 * Downloads the model (cached in Cache Storage after the first load; POSE-01). Rejects truncated
 * downloads and stale/corrupt cache entries instead of handing ORT a partial file.
 */
export async function fetchModel(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ bytes: Uint8Array; fromCache: boolean }> {
  const expected = KNOWN_SIZES[url];
  const cache = await openCache();
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    const bytes = new Uint8Array(await cached.arrayBuffer());
    if (!expected || bytes.byteLength === expected) {
      onProgress?.(bytes.byteLength, bytes.byteLength);
      return { bytes, fromCache: true };
    }
    await cache?.delete(url).catch(() => false);
  }
  const res = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`Model download failed (HTTP ${res.status})`);
  const encoded = Boolean(res.headers.get("content-encoding"));
  const total = expected ?? (encoded ? 0 : Number(res.headers.get("content-length")) || 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }
  if (total && loaded !== total) {
    throw new Error(`Model download was cut off (${(loaded / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB). Check the connection and try again.`);
  }
  const bytes = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.byteLength;
  }
  chunks.length = 0;
  await cache?.put(url, new Response(bytes)).catch(() => undefined);
  return { bytes, fromCache: false };
}

/**
 * Creates an ORT session, trying WebGPU then WASM. `getBytes` is called per attempt so a failed
 * backend can't leave the next one with a consumed buffer. All backend errors are reported.
 */
export async function createSession(
  getBytes: () => Uint8Array | Promise<Uint8Array>,
  prefer: Backend = "webgpu",
): Promise<LoadedModel> {
  const ort = await loadOrt();
  ort.env.wasm.wasmPaths = "/ort/";
  // WebKit caps wasm memory tightly; one thread avoids the extra per-thread heaps on iPhone.
  ort.env.wasm.numThreads = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated && !isIOS()
    ? Math.min(4, navigator.hardwareConcurrency || 2)
    : 1;

  const order: Backend[] = prefer === "webgpu" && "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
  const errors: string[] = [];
  for (const backend of order) {
    try {
      const bytes = await getBytes();
      if (!bytes.byteLength) throw new Error("model bytes are empty");
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [backend],
        graphOptimizationLevel: "all",
      });
      return { ort, session, backend, inputNames: session.inputNames, outputNames: session.outputNames };
    } catch (e) {
      errors.push(`${backend}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(errors.join(" | "));
}

/**
 * Download (or read from cache) + create a session. If ORT can't parse a cached copy, the cache
 * entry is dropped and the model is downloaded once more before giving up.
 */
export async function loadModel(
  url: string,
  prefer: Backend,
  onProgress?: (loaded: number, total: number) => void,
): Promise<LoadedModel> {
  try {
    return await loadOnce(url, prefer, onProgress);
  } catch (e) {
    // The full fp16 model can exceed the device's wasm memory; the int8 copy needs far less.
    if (url === LITE_MODEL_URL) throw e;
    return loadOnce(LITE_MODEL_URL, prefer, onProgress).catch((e2) => {
      throw new Error(`${e instanceof Error ? e.message : String(e)} || lite model: ${e2 instanceof Error ? e2.message : String(e2)}`);
    });
  }
}

async function loadOnce(
  url: string,
  prefer: Backend,
  onProgress?: (loaded: number, total: number) => void,
): Promise<LoadedModel> {
  let { bytes, fromCache } = await fetchModel(url, onProgress);
  try {
    return await createSession(() => (bytes.byteLength ? bytes : fetchModel(url).then((r) => r.bytes)), prefer);
  } catch (e) {
    await forgetModel(url);
    if (fromCache) {
      ({ bytes, fromCache } = await fetchModel(url, onProgress));
      try {
        return await createSession(() => bytes, prefer);
      } catch (e2) {
        e = e2;
      }
    }
    throw new Error(`${e instanceof Error ? e.message : String(e)} [${await fingerprint(bytes)}]`);
  }
}

/** Size + short SHA-256 of the bytes ORT rejected, so a corrupt download is distinguishable from a runtime limit. */
async function fingerprint(bytes: Uint8Array) {
  try {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
    return `${bytes.byteLength} B, sha256 ${[...hash.slice(0, 6)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return `${bytes.byteLength} B`;
  }
}

export type HmrOutput = {
  joints2dNorm: Float32Array; // (70, 2) in [-1, 1] crop space
  joints3d: Float32Array | null; // (70, 3) metres, body-centred, Y down
};

export async function runHmr(
  model: LoadedModel,
  image: Float32Array,
  cliff: Float32Array,
): Promise<HmrOutput> {
  const { ort } = model;
  const feeds = {
    [model.inputNames[0]!]: new ort.Tensor("float32", image, [1, 3, 224, 224]),
    [model.inputNames[1]!]: new ort.Tensor("float32", cliff, [1, 3]),
  };
  const out = await model.session.run(feeds);
  const j2 = out["joints_2d"] ?? out[model.outputNames[3]!];
  const j3 = out["joints_3d"] ?? (model.outputNames[4] ? out[model.outputNames[4]] : undefined);
  return {
    joints2dNorm: (await j2!.getData()) as Float32Array,
    joints3d: j3 ? ((await j3.getData()) as Float32Array) : null,
  };
}
