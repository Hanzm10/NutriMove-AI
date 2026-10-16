/// <reference lib="webworker" />
// InstantHMR inference off the main thread (POSE-02). Receives a 224×224 person crop (cut on the main thread) and
// returns crop-space 2D + metric 3D joints. All logic lives in worker-core.ts (unit-tested).
import { loadModel } from "./session";
import { createWorkerCore, type WorkerRequest, type WorkerResponse } from "./worker-core";

export type { WorkerRequest, WorkerResponse } from "./worker-core";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const core = createWorkerCore({
  post: (msg, transfer = []) => ctx.postMessage(msg, transfer),
  loadModel,
  createContext: (size) => new OffscreenCanvas(size, size).getContext("2d", { willReadFrequently: true })!,
});

ctx.postMessage({ type: "stage", stage: "worker started" } satisfies WorkerResponse);
ctx.onmessage = (e: MessageEvent<WorkerRequest>) => void core.handle(e.data);
