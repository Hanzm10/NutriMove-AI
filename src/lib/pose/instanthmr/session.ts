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

/** Downloads the model (cached in Cache Storage after the first load; POSE-01). */
export async function fetchModel(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const cache = typeof caches !== "undefined" ? await caches.open(MODEL_CACHE).catch(() => null) : null;
  const cached = await cache?.match(url);
  if (cached) {
    const buf = await cached.arrayBuffer();
    onProgress?.(buf.byteLength, buf.byteLength);
    return buf;
  }
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
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
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  await cache?.put(url, new Response(buf.slice().buffer)).catch(() => undefined);
  return buf.buffer;
}

export async function createSession(model: ArrayBuffer, prefer: Backend = "webgpu"): Promise<LoadedModel> {
  const ort = await loadOrt();
  ort.env.wasm.wasmPaths = "/ort/";
  ort.env.wasm.numThreads = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency || 2)
    : 1;

  const order: Backend[] = prefer === "webgpu" && "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
  let lastError: unknown;
  for (const backend of order) {
    try {
      const session = await ort.InferenceSession.create(model, {
        executionProviders: [backend],
        graphOptimizationLevel: "all",
      });
      return { ort, session, backend, inputNames: session.inputNames, outputNames: session.outputNames };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
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
