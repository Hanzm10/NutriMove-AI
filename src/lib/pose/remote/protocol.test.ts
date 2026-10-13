import { describe, expect, it } from "vitest";
import { clearPairing, encodeFrame, loadPairing, parsePairing, parseReply, savePairing, wsUrl } from "./protocol";

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("remote pose protocol", () => {
  it("encodes id, cliff and jpeg little-endian", () => {
    const buf = encodeFrame(7, new Float32Array([0.5, -0.25, 0.8]), new Uint8Array([0xff, 0xd8, 1]));
    const v = new DataView(buf);
    expect(buf.byteLength).toBe(19);
    expect(v.getUint32(0, true)).toBe(7);
    expect(v.getFloat32(4, true)).toBeCloseTo(0.5);
    expect(v.getFloat32(8, true)).toBeCloseTo(-0.25);
    expect(v.getFloat32(12, true)).toBeCloseTo(0.8);
    expect([...new Uint8Array(buf, 16)]).toEqual([0xff, 0xd8, 1]);
  });

  it("parses a good reply and rejects malformed ones", () => {
    const ok = parseReply(JSON.stringify({ id: 3, ms: 12.5, j2: Array(140).fill(0.1), j3: Array(210).fill(0.2) }));
    expect(ok?.id).toBe(3);
    expect(ok?.joints2d).toHaveLength(140);
    expect(ok?.joints3d).toHaveLength(210);
    expect(parseReply(JSON.stringify({ id: 3, ms: 1, j2: Array(140).fill(0), j3: null }))?.joints3d).toBeNull();
    expect(parseReply(JSON.stringify({ id: 3, ms: 1, j2: [1, 2], j3: null }))).toBeNull();
    expect(parseReply(JSON.stringify({ id: 3, ms: 1, j2: Array(140).fill(0), j3: [1] }))).toBeNull();
    expect(parseReply("not json")).toBeNull();
    expect(parseReply("[]")).toBeNull();
    expect(parseReply(JSON.stringify({ id: 9, error: "bad frame" }))).toMatchObject({ id: 9, error: "bad frame" });
  });

  it("only pairs with trycloudflare.com or localhost", () => {
    expect(parsePairing("abc-def.trycloudflare.com", "123456")).toEqual({ server: "abc-def.trycloudflare.com", token: "123456" });
    expect(parsePairing("https://abc-def.trycloudflare.com/", "123456")?.server).toBe("abc-def.trycloudflare.com");
    expect(parsePairing("wss://abc.trycloudflare.com", "123456")?.server).toBe("abc.trycloudflare.com");
    expect(parsePairing("localhost:8000", "123456")?.server).toBe("localhost:8000");
    expect(parsePairing("evil.example.com", "123456")).toBeNull();
    expect(parsePairing("trycloudflare.com.evil.io", "123456")).toBeNull();
    expect(parsePairing("evil.com/x.trycloudflare.com", "123456")).toBeNull();
    expect(parsePairing("abc.trycloudflare.com", "12")).toBeNull();
    expect(parsePairing("abc.trycloudflare.com", "12 34")).toBeNull();
    expect(parsePairing(null, "123456")).toBeNull();
    expect(parsePairing("pose.team.example", "123456", ["pose.team.example"])?.server).toBe("pose.team.example");
  });

  it("builds ws urls and remembers the pairing", () => {
    expect(wsUrl({ server: "a.trycloudflare.com", token: "123456" })).toBe("wss://a.trycloudflare.com/ws/pose?token=123456");
    expect(wsUrl({ server: "localhost:8000", token: "1a2b3c" })).toBe("ws://localhost:8000/ws/pose?token=1a2b3c");
    const s = store();
    expect(loadPairing(s)).toBeNull();
    savePairing(s, { server: "a.trycloudflare.com", token: "123456" });
    expect(loadPairing(s)).toEqual({ server: "a.trycloudflare.com", token: "123456" });
    clearPairing(s);
    expect(loadPairing(s)).toBeNull();
    expect(loadPairing(null)).toBeNull();
  });
});
