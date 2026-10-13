import { describe, expect, it } from "vitest";
import { RUNGS, createLoadGuard, defaultRung, nextRung, parseLoadParams } from "./load-guard";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("rung ladder", () => {
  it("goes heaviest → lightest and ends", () => {
    expect(RUNGS.map((r) => r.id)).toEqual(["auto", "full-wasm", "lite-wasm", "lite-1t"]);
    expect(nextRung("auto")!.id).toBe("full-wasm");
    expect(nextRung("lite-1t")).toBeNull();
  });
  it("iPhones start at the lightest rung, everything else at the best", () => {
    expect(defaultRung(true).id).toBe("lite-1t");
    expect(defaultRung(false).id).toBe("auto");
  });
});

describe("createLoadGuard", () => {
  it("starts from the default on first use and leaves a breadcrumb", () => {
    const store = memory();
    const g = createLoadGuard(store);
    const r = g.begin(defaultRung(false));
    expect(r.rung!.id).toBe("auto");
    expect(r.crashed).toBeNull();
    expect(JSON.parse(store.getItem("nm-pose-attempt-v1")!).rung).toBe("auto");
  });

  it("a page killed mid-attempt makes the next load start one rung lighter and reports where it died", () => {
    const store = memory();
    let t = 1_000;
    const first = createLoadGuard(store, () => t);
    first.begin(defaultRung(false));
    first.stage("creating session (webgpu)");
    // page is killed here: no success(), fail() or cleanExit()
    t += 5_000;
    const second = createLoadGuard(store, () => t);
    const r = second.begin(defaultRung(false));
    expect(r.crashed).toMatchObject({ rung: "auto", stage: "creating session (webgpu)" });
    expect(r.rung!.id).toBe("full-wasm");
    expect(r.previousLog.join("\n")).toContain("creating session (webgpu)");
    // and it keeps stepping down on repeated crashes, then runs out
    t += 5_000;
    expect(createLoadGuard(store, () => t).begin(defaultRung(false)).rung!.id).toBe("lite-wasm");
    t += 5_000;
    expect(createLoadGuard(store, () => t).begin(defaultRung(false)).rung!.id).toBe("lite-1t");
    t += 5_000;
    const last = createLoadGuard(store, () => t).begin(defaultRung(false));
    expect(last.rung).toBeNull();
    // exhausted state sticks until reset
    expect(createLoadGuard(store, () => t + 1).begin(defaultRung(false)).rung).toBeNull();
    const g = createLoadGuard(store, () => t + 2);
    g.reset();
    expect(g.begin(defaultRung(false)).rung!.id).toBe("auto");
  });

  it("success remembers the rung; a leaving user (pagehide) is not a crash", () => {
    const store = memory();
    const a = createLoadGuard(store);
    a.begin(defaultRung(false));
    a.fail("webgpu: nope");
    const b = createLoadGuard(store);
    expect(b.begin(defaultRung(false)).rung!.id).toBe("full-wasm");
    b.success();
    const peek = createLoadGuard(store);
    expect(peek.begin(defaultRung(false)).rung!.id).toBe("full-wasm");
    peek.cleanExit();
    const c = createLoadGuard(store);
    c.begin(defaultRung(false));
    c.cleanExit();
    const d = createLoadGuard(store).begin(defaultRung(false));
    expect(d.crashed).toBeNull();
    expect(d.rung!.id).toBe("full-wasm");
  });

  it("a stale breadcrumb (> 30 min) is ignored", () => {
    const store = memory();
    let t = 0;
    createLoadGuard(store, () => t).begin(defaultRung(false));
    t += 31 * 60_000;
    const r = createLoadGuard(store, () => t).begin(defaultRung(false));
    expect(r.crashed).toBeNull();
    expect(r.rung!.id).toBe("auto");
  });

  it("?rung= forces a rung without touching the saved ladder position", () => {
    const store = memory();
    const g = createLoadGuard(store);
    const r = g.begin(defaultRung(false), RUNGS[2]);
    expect(r.rung!.id).toBe("lite-wasm");
  });

  it("works when storage throws (private mode)", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    const g = createLoadGuard(broken);
    expect(g.begin(defaultRung(true)).rung!.id).toBe("lite-1t");
    expect(() => { g.stage("x"); g.success(); g.fail("y"); g.cleanExit(); g.reset(); }).not.toThrow();
  });
});

describe("parseLoadParams", () => {
  it("reads the diagnostics flags and rejects bad values", () => {
    expect(parseLoadParams("?rung=lite-wasm&threads=2&ep=wasm&model=lite&debug=1")).toMatchObject({
      rung: { id: "lite-wasm" }, threads: 2, ep: "wasm", model: "lite", debug: true,
    });
    expect(parseLoadParams("?rung=nope&threads=99&model=//evil.com/x.onnx")).toMatchObject({ rung: null, threads: null, model: null, debug: false });
    expect(parseLoadParams("?model=/models/a.onnx").model).toBe("/models/a.onnx");
  });
});
