// Wire format and pairing helpers for the laptop pose server (PRD §7.7.3, POSE-18/19). Pure, no DOM.
// client → server (binary): [uint32 LE frame id][float32 LE ×3 CLIFF condition][JPEG of the 224 px crop]
// server → client (text JSON): { id, ms, j2: number[140], j3: number[210] | null } or { id, error }

export const HEADER_BYTES = 16;
export const MHR70_JOINTS = 70;

export type Pairing = { server: string; token: string };
export type RemoteResult = { id: number; ms: number; joints2d: Float32Array; joints3d: Float32Array | null };

export function encodeFrame(id: number, cliff: Float32Array, jpeg: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(HEADER_BYTES + jpeg.byteLength);
  const view = new DataView(out);
  view.setUint32(0, id >>> 0, true);
  for (let i = 0; i < 3; i++) view.setFloat32(4 + i * 4, cliff[i] ?? 0, true);
  new Uint8Array(out, HEADER_BYTES).set(jpeg);
  return out;
}

/** Parses a server reply; returns null for anything malformed. A reply with `error` has `ms: -1` and empty joints. */
export function parseReply(text: string): (RemoteResult & { error?: string }) | null {
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (typeof m.id !== "number") return null;
  if (typeof m.error === "string") return { id: m.id, ms: -1, joints2d: new Float32Array(0), joints3d: null, error: m.error };
  const j2 = m.j2, j3 = m.j3;
  if (!Array.isArray(j2) || j2.length !== MHR70_JOINTS * 2 || typeof m.ms !== "number") return null;
  if (j3 != null && (!Array.isArray(j3) || j3.length !== MHR70_JOINTS * 3)) return null;
  return { id: m.id, ms: m.ms, joints2d: Float32Array.from(j2 as number[]), joints3d: j3 ? Float32Array.from(j3 as number[]) : null };
}

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/**
 * Accepts `abc-def.trycloudflare.com`, a full https/wss URL, or `localhost:8000`, and returns a Pairing (or null).
 * Only trycloudflare.com hosts and localhost are allowed so a crafted link cannot send camera crops to a stranger.
 */
export function parsePairing(server: string | null, token: string | null, extraHosts: readonly string[] = []): Pairing | null {
  if (!server || !token || !/^[A-Za-z0-9]{4,32}$/.test(token)) return null;
  const bare = server.trim().replace(/^(https?|wss?):\/\//i, "").replace(/\/+$/, "");
  const host = bare.split(":")[0]!.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  if (!local && !(HOST.test(host) && (host.endsWith(".trycloudflare.com") || extraHosts.includes(host)))) return null;
  if (!/^[a-z0-9.-]+(:\d{2,5})?$/i.test(bare)) return null;
  return { server: bare, token };
}

export function wsUrl({ server, token }: Pairing): string {
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(server);
  return `${local ? "ws" : "wss"}://${server}/ws/pose?token=${encodeURIComponent(token)}`;
}

export function httpUrl({ server }: Pairing, path: string): string {
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(server);
  return `${local ? "http" : "https"}://${server}${path}`;
}

export const PAIRING_KEY = "nm-pose-remote-v1";
const KEY = PAIRING_KEY;

/** Parses the stored value (null/garbage → null). Lets components read the raw string via useSyncExternalStore. */
export function pairingFromRaw(raw: string | null | undefined): Pairing | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Pairing>;
    return parsePairing(p.server ?? null, p.token ?? null);
  } catch {
    return null;
  }
}

/** Remembers the pairing on this device only. */
export function loadPairing(store: Pick<Storage, "getItem"> | null): Pairing | null {
  try {
    return pairingFromRaw(store?.getItem(KEY));
  } catch {
    return null;
  }
}
export function savePairing(store: Pick<Storage, "setItem"> | null, p: Pairing) {
  try {
    store?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: pairing lasts for this page only */
  }
}
export function clearPairing(store: Pick<Storage, "removeItem"> | null) {
  try {
    store?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
