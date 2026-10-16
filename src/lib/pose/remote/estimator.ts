import { FrameCropper, type CropCanvas } from "../crop";
import { mhr70ToCanonical } from "../instanthmr/adapter";
import { cropJointsToFrame } from "../instanthmr/preprocess";
import { SkippedFrame } from "../skipped";
import type { CanonicalPose, EstimatorStats } from "../types";
import { encodeFrame, parseReply, wsUrl, type Pairing, type RemoteResult } from "./protocol";

const JPEG_QUALITY = 0.85;

export { isSkippedFrame } from "../skipped";

/**
 * Pose estimation on the user's own laptop (PRD §7.7.3). The phone crops the person to 224 px and sends only that
 * small JPEG over a secure WebSocket; the server returns the same joints the in-browser model would. Nothing runs
 * ONNX on this device, so it works on phones that can't. Same shape as InstantHmrEstimator so the coach loop is unchanged.
 */
export class RemotePoseEstimator {
  readonly kind = "remote" as const;
  private ws?: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: RemoteResult) => void; reject: (e: Error) => void }>();
  private cropper?: FrameCropper;
  private rtt = 0;
  private serverMs = 0;
  private disposed = false;
  private closed = false;

  constructor(
    private readonly pairing: Pairing,
    private readonly makeCanvas?: (size: number) => CropCanvas,
  ) {}

  /** False once disposed or once the laptop connection closed. */
  get alive() {
    return !this.disposed && !this.closed;
  }

  /** Opens the socket; rejects with a human-readable reason if the laptop can't be reached. */
  load(): Promise<{ backend: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(wsUrl(this.pairing));
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      const timer = setTimeout(() => fail("Timed out. Is the laptop's pose server running and the tunnel still up?"), 12_000);
      const fail = (m: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.close();
        reject(new Error(m));
      };
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ backend: "laptop" });
      };
      ws.onclose = (e) => {
        const why =
          e.code === 4401 || e.code === 1006 || e.code === 1008
            ? "The laptop refused the connection (wrong pairing code, or the server is not running). Scan the QR again."
            : e.code === 4409
              ? "Someone else is already using the laptop coach."
              : "The connection to the laptop closed.";
        this.closed = true;
        fail(why);
        this.failAll(new Error(why));
      };
      ws.onerror = () => fail("Could not reach the laptop. Check the hotspot and that the tunnel is running, then scan the QR again.");
      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        const r = parseReply(e.data);
        const p = r && this.pending.get(r.id);
        if (!r || !p) return;
        this.pending.delete(r.id);
        if (r.ms < 0) p.reject(new SkippedFrame(r.error ?? "skipped"));
        else p.resolve(r);
      };
    });
  }

  /** Crops the person on this device and sends only that 224×224 JPEG; the full frame never leaves the phone. */
  async estimate(source: CanvasImageSource, frameW: number, frameH: number, box: CanonicalPose["box"]) {
    const cropper = (this.cropper ??= new FrameCropper(this.makeCanvas));
    const { sq, cliff } = cropper.draw(source, frameW, frameH, box);
    const jpeg = await cropper.jpeg(JPEG_QUALITY);
    const t0 = performance.now();
    const res = await this.send(jpeg, cliff);
    const roundTrip = performance.now() - t0;
    this.rtt = this.rtt ? this.rtt * 0.8 + roundTrip * 0.2 : roundTrip;
    this.serverMs = this.serverMs ? this.serverMs * 0.8 + res.ms * 0.2 : res.ms;
    const joints2d = cropJointsToFrame(res.joints2d, sq);
    const pose = mhr70ToCanonical(joints2d, res.joints3d, box, performance.now());
    const stats: EstimatorStats = { preprocessMs: roundTrip - res.ms, inferenceMs: res.ms, backend: `laptop · ${Math.round(this.rtt)} ms round trip` };
    return { pose, stats, raw2d: joints2d };
  }

  /**
   * How many frames to keep in flight: enough to hide the network delay, but no more than the laptop can keep up with.
   * Round trip ≈ network + laptop time; at ~15 fps (67 ms per frame) we need ⌈round trip / max(laptop time, 67)⌉ frames.
   */
  get suggestedInFlight() {
    if (!this.rtt) return 1;
    return Math.max(1, Math.min(3, Math.round(this.rtt / Math.max(this.serverMs, 1000 / 15))));
  }

  dispose() {
    this.disposed = true;
    this.failAll(new Error("disposed"));
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
  }

  private send(jpeg: Uint8Array, cliff: Float32Array) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("The connection to the laptop closed."));
    const id = this.nextId++;
    return new Promise<RemoteResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("The laptop stopped answering."));
      }, 5_000);
      this.pending.set(id, {
        resolve: (r) => (clearTimeout(timer), resolve(r)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      ws.send(encodeFrame(id, cliff, jpeg));
    });
  }

  private failAll(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
