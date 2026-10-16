import type * as Ort from "onnxruntime-web/webgpu";

// Browser-only: never import onnxruntime-web at module scope (breaks server prerendering).
let ortPromise: Promise<typeof Ort> | null = null;
function loadOrt() {
  ortPromise ??= import("onnxruntime-web/webgpu");
  return ortPromise;
}

// `||`, not `??`: an env var set to "" (e.g. copied blank from .env.example) must fall back too,
// otherwise fetch("") downloads the current HTML page and ORT reports "protobuf parsing failed".
export const DEFAULT_MODEL_URL =
  process.env.NEXT_PUBLIC_MODEL_URL?.trim() ||
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
/** Byte size of the released models; a download of any other size is truncated or wrong. */
const KNOWN_SIZES: Record<string, number> = {
  "https://huggingface.co/momolesang/InstantHMR/resolve/main/instanthmr.onnx": 80_961_622,
  "/models/instanthmr-int8.onnx": 51_786_006,
};

/**
 * Int8 weight-quantized copy of the same model (fp16 → fp32 → dynamic int8, served same-origin).
 * Weights stay int8 at runtime, so it needs far less memory than the original, which WASM expands to fp32.
 * Measured against the original: ~1.5 px mean 2D joint error on the 224 px crop.
 */
export const LITE_MODEL_URL = "/models/instanthmr-int8.onnx";

/** iPhone/iPad (including iPadOS reporting as Mac). Used to keep wasm memory low on WebKit. */
export const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1));

export type LoadOptions = {
  prefer: Backend;
  /** WASM threads. Default: up to 4 when cross-origin isolated (not on iOS), otherwise 1. */
  threads?: number;
};
export type StageFn = (stage: string) => void;

async function openCache() {
  return typeof caches !== "undefined" ? caches.open(MODEL_CACHE).catch(() => null) : null;
}

/** Drops a cached model copy so the next load downloads it again. */
export async function forgetModel(url: string) {
  await (await openCache())?.delete(url).catch(() => false);
}

/**
 * Downloads the model. Cross-origin models (Hugging Face, whose signed CDN URLs defeat the HTTP cache) are kept
 * in Cache Storage after the first load; same-origin ones rely on the HTTP cache, which avoids a second
 * in-memory copy. Rejects truncated downloads and stale cache entries instead of handing ORT a partial file.
 * When the size is known the bytes stream straight into one preallocated buffer (no chunk list + copy).
 */
export async function fetchModel(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ bytes: Uint8Array; fromCache: boolean }> {
  const expected = KNOWN_SIZES[url];
  const useCache = !url.startsWith("/");
  const cache = useCache ? await openCache() : null;
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    const bytes = new Uint8Array(await cached.arrayBuffer());
    if (!expected || bytes.byteLength === expected) {
      onProgress?.(bytes.byteLength, bytes.byteLength);
      return { bytes, fromCache: true };
    }
    await cache?.delete(url).catch(() => false);
  }
  const res = await fetch(url, { mode: "cors", cache: useCache ? "no-store" : "default" });
  if (!res.ok || !res.body) throw new Error(`Model download failed (HTTP ${res.status})`);
  if (res.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`Model URL returned a web page, not a model: ${url || "(empty)"}`);
  }
  const encoded = Boolean(res.headers.get("content-encoding"));
  const total = expected ?? (encoded ? 0 : Number(res.headers.get("content-length")) || 0);
  const reader = res.body.getReader();
  let loaded = 0;
  let bytes: Uint8Array;
  if (total) {
    bytes = new Uint8Array(total);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (loaded + value.byteLength > total) throw new Error(`Model download was larger than expected (${total} B).`);
      bytes.set(value, loaded);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
    if (loaded !== total) {
      throw new Error(`Model download was cut off (${(loaded / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB). Check the connection and try again.`);
    }
  } else {
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, 0);
    }
    bytes = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.byteLength;
    }
  }
  // Written only after a full, size-checked download; failures here just mean no cache.
  if (cache) await cache.put(url, new Response(bytes as Uint8Array<ArrayBuffer>)).catch(() => undefined);
  return { bytes, fromCache: false };
}

/**
 * Creates an ORT session, trying WebGPU then WASM. `getBytes` is called per attempt so a failed
 * backend can't leave the next one with a consumed buffer. All backend errors are reported.
 */
export async function createSession(
  getBytes: () => Uint8Array | Promise<Uint8Array>,
  opts: LoadOptions,
  onStage?: StageFn,
): Promise<LoadedModel> {
  const ort = await loadOrt();
  ort.env.wasm.wasmPaths = "/ort/";
  // WebKit caps wasm memory tightly; one thread avoids the extra per-thread heaps on iPhone.
  ort.env.wasm.numThreads = opts.threads
    ?? (typeof crossOriginIsolated !== "undefined" && crossOriginIsolated && !isIOS() ? Math.min(4, navigator.hardwareConcurrency || 2) : 1);

  const order: Backend[] = opts.prefer === "webgpu" && "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
  const errors: string[] = [];
  for (const backend of order) {
    try {
      const bytes = await getBytes();
      if (!bytes.byteLength) throw new Error("model bytes are empty");
      const threads = backend === "wasm" ? ort.env.wasm.numThreads : 1;
      onStage?.(`creating session (${backend}, ${threads} thread${threads === 1 ? "" : "s"})`);
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [backend],
        graphOptimizationLevel: "all",
      });
      onStage?.(`session ready (${backend})`);
      return { ort, session, backend, inputNames: session.inputNames, outputNames: session.outputNames };
    } catch (e) {
      errors.push(`${backend}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(errors.join(" | "));
}

/**
 * Download (or read from cache) + create a session for ONE configuration. If ORT can't parse a cached copy, the
 * cache entry is dropped and the model is downloaded once more. Falling back to a lighter configuration is the
 * caller's job (see load-guard.ts): an out-of-memory kill can't be caught here.
 */
export async function loadModel(
  url: string,
  opts: LoadOptions,
  onProgress?: (loaded: number, total: number) => void,
  onStage?: StageFn,
): Promise<LoadedModel> {
  onStage?.("downloading model");
  let { bytes, fromCache } = await fetchModel(url, onProgress);
  onStage?.(`model ready in memory (${(bytes.byteLength / 1e6).toFixed(0)} MB${fromCache ? ", cached" : ""})`);
  try {
    return await createSession(() => (bytes.byteLength ? bytes : fetchModel(url).then((r) => r.bytes)), opts, onStage);
  } catch (e) {
    await forgetModel(url);
    if (fromCache) {
      onStage?.("cached copy rejected, downloading again");
      ({ bytes, fromCache } = await fetchModel(url, onProgress));
      try {
        return await createSession(() => bytes, opts, onStage);
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

/** The only outputs the coach uses. Asking ORT for just these skips copying mhr_params, shape_params and cam_trans. */
export const JOINT_OUTPUTS = ["joints_2d", "joints_3d"] as const;

export type HmrRunner = {
  /** Write the normalised CHW crop here (3 × 224 × 224). Allocated once per runner. */
  readonly input: Float32Array;
  /** Write the CLIFF vector here. Allocated once per runner. */
  readonly cliff: Float32Array;
  readonly fetches: readonly string[];
  run(): Promise<HmrOutput>;
};

/**
 * Binds one input buffer, one CLIFF buffer and their tensors to the session for its whole life: every frame overwrites
 * the same memory instead of allocating ~600 KB. ORT tensors keep a reference to the array, so writing into `input`
 * updates the feed. Not re-entrant: run one frame at a time (the worker enforces this).
 */
export function createRunner(model: LoadedModel, size = 224): HmrRunner {
  const { ort, session } = model;
  const input = new Float32Array(3 * size * size);
  const cliff = new Float32Array(3);
  const feeds = {
    [model.inputNames[0]!]: new ort.Tensor("float32", input, [1, 3, size, size]),
    [model.inputNames[1]!]: new ort.Tensor("float32", cliff, [1, 3]),
  };
  // By name when the model has them (it does: checked on Day 1), else by position as before.
  const [j2Name, j3Name] = JOINT_OUTPUTS.every((n) => model.outputNames.includes(n))
    ? JOINT_OUTPUTS
    : [model.outputNames[3]!, model.outputNames[4]];
  const fetches = j3Name ? [j2Name, j3Name] : [j2Name];
  return {
    input,
    cliff,
    fetches,
    async run() {
      const out = await session.run(feeds, fetches);
      const j3 = j3Name ? out[j3Name] : undefined;
      return {
        joints2dNorm: (await out[j2Name]!.getData()) as Float32Array,
        joints3d: j3 ? ((await j3.getData()) as Float32Array) : null,
      };
    },
  };
}
